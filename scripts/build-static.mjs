#!/usr/bin/env node
/**
 * Poneglyph — the static site, for GitHub Pages.
 *
 *   node scripts/build-static.mjs
 *
 * Produces out/: plain HTML, JSON and JS with no server behind it. What that costs,
 * and what it buys, is written up in src/app/not-found.tsx and src/lib/shards.ts.
 *
 * Two things have to happen around the Next build itself.
 *
 * **The art proxy has to go.** `src/app/art/[id]/route.ts` fetches card images from
 * the official CDN on first request and mirrors them; `output: 'export'` refuses to
 * build while any route handler exists, and rightly so — there is nothing to run it.
 * It is moved aside for the build and put back afterwards, including when the build
 * fails, because leaving a checkout without its art proxy would break `npm run dev`
 * in a way that looks unrelated.
 *
 * **`.nojekyll` has to be there.** GitHub Pages runs Jekyll by default, and Jekyll
 * skips every file and directory whose name starts with an underscore. Next puts the
 * entire application in `_next/`. Without this file the deploy succeeds, the HTML
 * loads, and the site is unstyled and inert.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * `.env.local`, as Next would read it.
 *
 * Next loads those files itself, so the build gets the variables either way — but
 * this script checks for NEXT_PUBLIC_CDN_URL *before* handing over, and plain Node
 * does not read them. Without this the guard below fires on a correctly configured
 * checkout, which is a confusing way to be told nothing is wrong.
 *
 * Real environment variables win, so CI can set them without a file.
 */
function loadEnvFiles() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[match[1]] ??= value;
    }
  }
}

loadEnvFiles();

const ART = path.resolve('src', 'app', 'art');
/*
 * Outside src/app, and that is the whole point: anything under the app directory is
 * a route, dot-prefixed or not. Parking it in place got it collected as
 * `/.art-parked-during-export/[id]` and failed the export for the same reason.
 *
 * Project root rather than the system temp directory, so the rename stays on one
 * filesystem and cannot fail halfway.
 */
const PARKED = path.resolve('.art-route-parked');
const OUT = path.resolve('out');

/** GitHub Pages refuses to publish a site over this, and warns well before it. */
const SIZE_LIMIT = 1024 * 1024 * 1024;

const log = (...m) => console.log('[static]', ...m);

async function measure(dir) {
  let files = 0;
  let bytes = 0;
  const walk = async (d) => {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        files++;
        bytes += (await stat(full)).size;
      }
    }
  };
  await walk(dir);
  return { files, bytes };
}

/**
 * Drop the local card-art mirror from the export.
 *
 * Next copies all of `public/` into `out/`, and `public/cards` holds 4,843 source
 * PNGs at 1.66 GB — the mirror the art proxy builds up so a checkout with no CDN
 * still shows images. The static site has a CDN by definition (the build refuses to
 * start without one), so shipping them would be two gigabytes nobody requests.
 *
 * Only the image files go. `out/cards` is also where the 2,785 card pages live —
 * the mirror and the pages share one path, `/cards/OP01-025.png` next to
 * `/cards/op01-025/` — so removing the directory would take the archive with it.
 */
async function stripArtMirror() {
  const dir = path.join(OUT, 'cards');
  if (!existsSync(dir)) return;

  let removed = 0;
  let bytes = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) continue;
    if (!/\.(png|jpe?g|webp)$/i.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    bytes += (await stat(full)).size;
    await rm(full);
    removed++;
  }

  if (removed > 0) {
    log(
      `dropped ${removed.toLocaleString('en-US')} mirrored images ` +
        `(${(bytes / 1024 / 1024).toFixed(0)} MB) — the CDN serves those`
    );
  }
}

/**
 * Give the router's prefetch files the names it actually asks for.
 *
 * Next's client asks for a page's payload at a flat path — `/decks/__next.decks.
 * __PAGE__.txt` — while the export writes it as nested directories,
 * `out/decks/__next.decks/__PAGE__.txt`. The segments are joined with dots in the
 * URL and with slashes on disk, so every prefetch misses.
 *
 * On a static host a miss is not free: the 404 is answered with 404.html, which is
 * a full 40 KB page. A screen with fifteen links quietly pulls half a megabyte of
 * error pages, which would undo the payload work this whole build is for.
 *
 * So each payload is rewritten under the flat name and the nested directory is
 * removed. Moved rather than copied: the nested path is not a URL the router ever
 * asks for — it asks for `__next._tree.txt` and the flat `__PAGE__` names, both of
 * which are files — so keeping both would be 89 MB of duplication in a repository
 * GitHub starts warning about at 750 MB.
 */
async function flattenPrefetchPayloads() {
  let written = 0;
  let bytes = 0;

  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('__next.')) {
        /* Everything under here becomes `<dirname>.<path with dots>` beside it. */
        const collect = async (inner, trail) => {
          for (const item of await readdir(inner, { withFileTypes: true })) {
            const here = path.join(inner, item.name);
            if (item.isDirectory()) await collect(here, [...trail, item.name]);
            else {
              const flat = [entry.name, ...trail, item.name].join('.');
              const body = await readFile(here);
              await writeFile(path.join(dir, flat), body);
              written++;
              bytes += body.length;
            }
          }
        };
        await collect(full, []);
        /* Nothing requests the nested form; leaving it is duplicated weight. */
        await rm(full, { recursive: true, force: true });
      } else {
        await walk(full);
      }
    }
  };

  await walk(OUT);
  log(
    `wrote ${written.toLocaleString('en-US')} prefetch payloads under the names the ` +
      `router requests (${(bytes / 1024 / 1024).toFixed(0)} MB)`
  );
}

async function main() {
  if (!process.env.NEXT_PUBLIC_CDN_URL) {
    console.error(
      '[static] NEXT_PUBLIC_CDN_URL is not set.\n' +
        '         The static build has no /art/[id] proxy to fall back on, so every card\n' +
        '         image would 404. Set it in .env.local (or the workflow environment)\n' +
        '         before building — see the card art section of CLAUDE.md.'
    );
    process.exit(1);
  }

  await rm(OUT, { recursive: true, force: true });

  /*
   * And the previous build's cache with it. Next writes a type validator listing
   * every route it found; a cache from a normal build still names the art proxy,
   * and typechecking then fails on a module this script has just moved aside. The
   * error points at a generated file and reads like a broken import.
   */
  await rm(path.resolve('.next'), { recursive: true, force: true });

  /* A build killed part-way leaves the route parked; put it back before starting. */
  if (existsSync(PARKED) && !existsSync(ART)) {
    log('restoring the art proxy left parked by an interrupted build');
    await rename(PARKED, ART);
  }

  const hadArt = existsSync(ART);
  if (hadArt) await rename(ART, PARKED);

  let status = 1;
  try {
    log('building — this generates about 4,700 pages, so give it a minute');
    /*
     * webpack, not Turbopack. Turbopack renames every chunk on every build even when
     * nothing changed, so each deploy rewrote 23,667 of 24,176 files — 466 MB of new
     * git objects, twice a day. webpack names chunks by content, so a build with the
     * same input produces the same files and the push carries only what moved.
     */
    status = spawnSync('npx', ['next', 'build', '--webpack'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, STATIC_EXPORT: '1' },
    }).status;
  } finally {
    /* Always, including after a failed build — a checkout without the proxy is worse. */
    if (hadArt) await rename(PARKED, ART);
  }

  if (status !== 0) {
    console.error('[static] the Next build failed; out/ is incomplete');
    process.exit(status ?? 1);
  }

  /* Jekyll would otherwise drop _next/ and take the whole application with it. */
  await writeFile(path.join(OUT, '.nojekyll'), '');

  /*
   * The custom domain, if there is one.
   *
   * GitHub Pages reads it from a CNAME file in the published branch — and adding one
   * through their settings page writes it into that branch, which deploy-site.mjs
   * replaces wholesale on the next deploy. The domain would then silently revert.
   * Written here so it survives, which is the only way it can.
   */
  if (process.env.PONEGLYPH_CNAME) {
    const domain = process.env.PONEGLYPH_CNAME.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    await writeFile(path.join(OUT, 'CNAME'), `${domain}\n`);
    log(`CNAME written for ${domain}`);
  }

  /*
   * Which source commit this was built from.
   *
   * The publish workflow reads it back off the deployed branch and skips the build
   * when the source has not moved. Five ingest schedules finishing means twelve
   * triggers a day, and most of them commit nothing — without this, twelve full
   * builds a day to produce output identical to what is already published.
   */
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (head.status === 0) await writeFile(path.join(OUT, '.source'), head.stdout.trim());

  await stripArtMirror();
  await flattenPrefetchPayloads();

  const { files, bytes } = await measure(OUT);
  const mb = (bytes / 1024 / 1024).toFixed(0);
  log(`out/ — ${files.toLocaleString('en-US')} files, ${mb} MB`);

  if (bytes > SIZE_LIMIT) {
    console.error(
      `[static] ${mb} MB is over GitHub Pages' 1 GB limit. Raising the prerender\n` +
        '         thresholds in the event, player and deck pages is what brings it down.'
    );
    process.exit(1);
  }

  log(`${((SIZE_LIMIT - bytes) / 1024 / 1024).toFixed(0)} MB left under the 1 GB limit`);
  log('deploy with:  npm run deploy:site');
}

main().catch((err) => {
  console.error('[static] FAILED —', err.message);
  process.exit(1);
});
