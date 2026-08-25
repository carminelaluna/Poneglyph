#!/usr/bin/env node
/**
 * Poneglyph — card art mirror.
 *
 * Downloads every printing's art into public/cards so production serves images
 * statically instead of proxying them per request. Safe to re-run: files already
 * on disk are skipped, so a run after a new set only fetches the new cards.
 *
 *   node scripts/fetch-images.mjs [--concurrency 6] [--force] [--only OP-17]
 *
 * Roughly 4,800 files at ~180 KB each — budget about 900 MB and 15 minutes on a
 * cold run. public/cards is gitignored; mirror it in CI or before a deploy.
 */

import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const CONCURRENCY = Number(flag('concurrency', 6));
const FORCE = args.includes('--force');
const ONLY = flag('only');
const OUT = path.resolve('public', 'cards');

const UPSTREAMS = [
  (id) => `https://en.onepiece-cardgame.com/images/cardlist/card/${id}.png`,
  (id) => `https://optcgapi.com/media/static/Card_Images/${id}.jpg`,
];

const log = (...m) => console.log('[images]', ...m);

const exists = (file) => access(file).then(() => true).catch(() => false);

async function download(id) {
  const file = path.join(OUT, `${id}.png`);
  if (!FORCE && (await exists(file))) return 'skipped';

  for (const upstream of UPSTREAMS) {
    try {
      const res = await fetch(upstream(id), {
        headers: { 'user-agent': 'poneglyph-images/1.0' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) continue;
      const type = res.headers.get('content-type') ?? '';
      if (!type.startsWith('image/')) continue;
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      return 'fetched';
    } catch {
      // Try the next upstream.
    }
  }
  return 'failed';
}

async function main() {
  const cards = JSON.parse(readFileSync(path.resolve('data', 'cards.json'), 'utf8'));
  const wanted = cards
    .filter((c) => !ONLY || c.setCode === ONLY)
    .flatMap((c) => c.printings.map((p) => p.id));

  if (!wanted.length) {
    log(ONLY ? `no cards in set ${ONLY}` : 'no cards — run `npm run ingest` first');
    process.exit(1);
  }

  await mkdir(OUT, { recursive: true });
  log(`${wanted.length} printings, concurrency ${CONCURRENCY}${FORCE ? ', forcing refetch' : ''}`);

  const tally = { fetched: 0, skipped: 0, failed: 0 };
  const failures = [];
  let done = 0;
  const started = Date.now();

  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, wanted.length) }, async () => {
      while (cursor < wanted.length) {
        const id = wanted[cursor++];
        const result = await download(id);
        tally[result]++;
        if (result === 'failed') failures.push(id);
        if (++done % 250 === 0 || done === wanted.length) {
          const rate = done / ((Date.now() - started) / 1000);
          log(`${done}/${wanted.length}  ${rate.toFixed(1)}/s  fetched ${tally.fetched}  skipped ${tally.skipped}  failed ${tally.failed}`);
        }
      }
    })
  );

  log(`done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  console.table(tally);
  if (failures.length) {
    log(`could not fetch ${failures.length}: ${failures.slice(0, 20).join(', ')}${failures.length > 20 ? '…' : ''}`);
    log('re-run to retry only the missing ones');
  }
}

main().catch((err) => {
  console.error('[images] FAILED —', err.message);
  process.exit(1);
});
