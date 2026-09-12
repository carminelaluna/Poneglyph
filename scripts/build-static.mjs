#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnvFiles } from './env.mjs';

loadEnvFiles();

const ART = path.resolve('src', 'app', 'art');
const PARKED = path.resolve('.art-route-parked');
const OUT = path.resolve('out');

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

async function flattenPrefetchPayloads() {
  let written = 0;
  let bytes = 0;

  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('__next.')) {
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

const SIGNALS = 'search=yes,ai-input=yes,ai-train=no';

async function writeRobotsSignals() {
  const file = path.join(OUT, 'robots.txt');
  if (!existsSync(file)) {
    console.log('[static] no robots.txt to sign — skipped');
    return;
  }

  const preamble = [
    '# As a condition of accessing this website, you agree to the content signals',
    '# below. A signal set to `yes` grants the corresponding use; `no` withholds it;',
    '# a use with no signal is neither granted nor restricted.',
    '#',
    '#   search    building a search index and returning links and short excerpts.',
    '#   ai-input  reading the content to answer a question now — retrieval,',
    '#             grounding, a cited answer. Not the same as training.',
    '#   ai-train  training or fine-tuning a model on the content.',
    '#',
    '# ANY RESTRICTION EXPRESSED HERE IS AN EXPRESS RESERVATION OF RIGHTS UNDER',
    '# ARTICLE 4 OF EU DIRECTIVE 2019/790 ON COPYRIGHT IN THE DIGITAL SINGLE MARKET.',
    '#',
    '# Poneglyph is an unofficial fan project. The card names, card text and artwork',
    "# are Bandai's and are reproduced for identification and reference; what is asked",
    '# for here is the archive built around them — the recorded results, the matchup',
    '# data joined out of published brackets, and the indexes derived from both.',
    '# See /legal.',
    '',
  ].join('\n');

  const held = await readFile(file, 'utf8');
  const signed = held.replace(/^(User-Agent: \*\r?\n)/im, `$1Content-Signal: ${SIGNALS}\n`);
  if (signed === held) {
    console.log('[static] ::warning::robots.txt has no `User-agent: *` group — not signed');
    return;
  }
  await writeFile(file, `${preamble}
${signed}`);
  console.log(`[static] robots.txt signed — ${SIGNALS}`);
}

async function writeSecurityTxt() {
  let email = null;
  try {
    const source = await readFile(path.resolve('src', 'lib', 'contact.ts'), 'utf8');
    email = source.match(/CONTACT_EMAIL\s*=\s*'([^']+)'/)?.[1] ?? null;
  } catch {
  }
  if (!email) {
    console.log('[static] ::warning::no contact address found in src/lib/contact.ts — no security.txt written');
    return;
  }

  const site = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  const expires = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');

  const body = [
    '# How to report a security problem with Poneglyph.',
    '#',
    '# Unofficial fan project, run by one person. There is no bounty and no SLA;',
    '# there is somebody who reads the address below and will fix what you find.',
    '# What is worth reporting: anything that reaches data belonging to another',
    '# account, any way to publish a tournament result without review, anything',
    '# that mints a role. The site itself is static files and a JSON archive.',
    '#',
    '# Regenerated on every deploy, so Expires below is never stale by neglect.',
    '',
    `Contact: mailto:${email}`,
    `Expires: ${expires}`,
    'Preferred-Languages: en, it',
    ...(site
      ? [`Canonical: ${site}/.well-known/security.txt`, `Canonical: ${site}/security.txt`]
      : []),
    '',
  ].join('\n');

  await mkdir(path.join(OUT, '.well-known'), { recursive: true });
  await writeFile(path.join(OUT, '.well-known', 'security.txt'), body);
  await writeFile(path.join(OUT, 'security.txt'), body);
  console.log(`[static] security.txt written, expiring ${expires.slice(0, 10)}`);
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

  await rm(path.resolve('.next'), { recursive: true, force: true });

  if (existsSync(PARKED) && !existsSync(ART)) {
    log('restoring the art proxy left parked by an interrupted build');
    await rename(PARKED, ART);
  }

  const hadArt = existsSync(ART);
  if (hadArt) await rename(ART, PARKED);

  let status = 1;
  try {
    log('building — this generates about 4,700 pages, so give it a minute');
    status = spawnSync('npx', ['next', 'build', '--webpack'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, STATIC_EXPORT: '1' },
    }).status;
  } finally {
    if (hadArt) await rename(PARKED, ART);
  }

  if (status !== 0) {
    console.error('[static] the Next build failed; out/ is incomplete');
    process.exit(status ?? 1);
  }

  await writeFile(path.join(OUT, '.nojekyll'), '');

  await writeRobotsSignals();
  await writeSecurityTxt();

  if (process.env.PONEGLYPH_CNAME) {
    const domain = process.env.PONEGLYPH_CNAME.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    await writeFile(path.join(OUT, 'CNAME'), `${domain}\n`);
    log(`CNAME written for ${domain}`);
  }

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
