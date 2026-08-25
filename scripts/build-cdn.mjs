#!/usr/bin/env node
/**
 * Poneglyph — build the card-art CDN bundle.
 *
 *   node scripts/build-cdn.mjs [--force] [--only OP17] [--concurrency 8]
 *
 * Converts the mirrored PNGs in public/cards into WebP at the three widths the
 * interface actually renders, ready to upload to Cloudflare Pages as a static
 * asset project.
 *
 * The source PNGs average 370 KB and are 600x838 regardless of where they appear —
 * a list row renders one at 38 px. Serving the original there sends roughly 250
 * times the pixels needed, which is why a grid of 60 tiles weighed 18 MB.
 *
 *   96 px   list rows and small tables (rendered 38-44 px, so 2x)
 *   320 px  card grids (rendered ~158 px, so 2x) — this is the one that decides
 *           page weight, since a grid shows 60 of them
 *   600 px  card detail and the lightbox, at the source's own width; only ever
 *           one on screen, so it is encoded for legibility rather than for size
 *
 * Output goes to cdn/, which is gitignored: it is derived from public/cards and
 * rebuilt, never committed.
 */

import { readdir, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const SRC = path.resolve('public', 'cards');
const OUT = path.resolve('cdn');
const CONCURRENCY = Number(flag('concurrency', 8));
const ONLY = flag('only');
const FORCE = has('force');

/** Width, and the quality that width is for. */
const SIZES = [
  { width: 96, quality: 72 },
  { width: 320, quality: 72 },
  { width: 600, quality: 80 },
];

/** Cloudflare Pages refuses a deployment above this on the free plan. */
const FILE_LIMIT = 20_000;

const log = (...m) => console.log('[cdn]', ...m);

const exists = (file) => stat(file).then(() => true).catch(() => false);

async function convert(name) {
  const id = path.basename(name, '.png');
  const source = path.join(SRC, name);
  let written = 0;
  let bytes = 0;

  for (const { width, quality } of SIZES) {
    const target = path.join(OUT, `${id}_${width}.webp`);
    if (!FORCE && (await exists(target))) {
      bytes += (await stat(target)).size;
      continue;
    }
    const buffer = await sharp(source)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality, effort: 5 })
      .toBuffer();
    await writeFile(target, buffer);
    written++;
    bytes += buffer.length;
  }

  return { written, bytes };
}

async function main() {
  const started = Date.now();

  const all = (await readdir(SRC).catch(() => []))
    .filter((f) => f.endsWith('.png'))
    .filter((f) => !ONLY || f.toUpperCase().startsWith(ONLY.toUpperCase()));

  if (all.length === 0) {
    console.error('[cdn] no PNGs in public/cards — run `npm run ingest:images` first');
    process.exit(1);
  }

  const planned = all.length * SIZES.length;
  log(`${all.length} cards x ${SIZES.length} widths = ${planned.toLocaleString('en-US')} files`);

  if (planned > FILE_LIMIT && !ONLY) {
    console.error(
      `[cdn] ${planned} files exceeds the Cloudflare Pages free limit of ${FILE_LIMIT}. ` +
        'Drop a width before deploying.'
    );
    process.exit(1);
  }

  await mkdir(OUT, { recursive: true });

  let done = 0;
  let written = 0;
  let bytes = 0;
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, all.length) }, async () => {
      while (cursor < all.length) {
        const name = all[cursor++];
        try {
          const result = await convert(name);
          written += result.written;
          bytes += result.bytes;
        } catch (err) {
          console.error(`[cdn] ! ${name}: ${err.message}`);
        }
        if (++done % 500 === 0 || done === all.length) {
          const rate = done / ((Date.now() - started) / 1000);
          log(`${done}/${all.length}  ${rate.toFixed(0)}/s  ${(bytes / 1024 / 1024).toFixed(0)} MB`);
        }
      }
    })
  );

  /*
   * Cache headers are the reason this is not simply dropped next to the site on
   * GitHub Pages, which does not let you set them. Every file is content-addressed
   * by card number and width and never changes, so it can be cached forever.
   */
  await writeFile(
    path.join(OUT, '_headers'),
    ['/*', '  Cache-Control: public, max-age=31536000, immutable', '  Access-Control-Allow-Origin: *', ''].join('\n')
  );

  const totalFiles = all.length * SIZES.length;
  log(`done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  console.table({
    cards: all.length,
    files: totalFiles,
    'files left before the 20,000 limit': FILE_LIMIT - totalFiles,
    'newly converted': written,
    'total MB': Math.round(bytes / 1024 / 1024),
  });
  log('upload with:  npx wrangler pages deploy ./cdn --project-name poneglyph-art');
}

main().catch((err) => {
  console.error('[cdn] FAILED —', err.message);
  process.exit(1);
});
