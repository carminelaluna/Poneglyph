#!/usr/bin/env node
/**
 * Poneglyph — did anything that matters actually change?
 *
 *   git add data public/data
 *   node scripts/substantive-change.mjs && git commit … || echo 'nothing moved'
 *
 * Exits 0 when the staged files differ from HEAD in some way other than a
 * timestamp, and 1 when they do not.
 *
 * Every ingest stamps its output with `generatedAt` and how long it took, so a run
 * that found nothing still rewrites the file and `git diff --quiet` still reports a
 * change. Three workflows compared files carrying those fields and therefore
 * committed on every single run: spoilers four times a day, rules three, prices
 * twice. Each commit then triggered a full site rebuild and deploy to publish a new
 * timestamp and nothing else.
 *
 * The obvious alternative — listing the files without timestamps, as the deck
 * workflow does — is what went stale when the per-entity shards appeared. This asks
 * the question directly instead, so it keeps working as the data layout changes.
 */

import { spawnSync } from 'node:child_process';

/**
 * Fields written on every run regardless of what was found.
 *
 * `upstreamBuiltAt` is deliberately not here: it records when the *source* was
 * rebuilt, so a change in it is real news.
 */
const VOLATILE = new Set(['generatedAt', 'durationMs', 'fetchedAt', 'thisRun']);

const git = (args) => spawnSync('git', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });

/** The same object with volatile fields removed, at any depth. */
function strip(value) {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (VOLATILE.has(key)) continue;
      out[key] = strip(value[key]);
    }
    return out;
  }
  return value;
}

/** Content as JSON with volatile fields gone, or the raw text if it is not JSON. */
function normalise(text) {
  try {
    return JSON.stringify(strip(JSON.parse(text)));
  } catch {
    return text;
  }
}

const staged = git(['diff', '--cached', '--name-only']).stdout.split('\n').filter(Boolean);

if (staged.length === 0) {
  console.log('[change] nothing staged');
  process.exit(1);
}

for (const file of staged) {
  const before = git(['show', `HEAD:${file}`]);
  /* Not in HEAD at all — a new file is a change by definition. */
  if (before.status !== 0) {
    console.log(`[change] new file: ${file}`);
    process.exit(0);
  }
  const after = git(['show', `:${file}`]);
  if (after.status !== 0) continue;

  if (normalise(before.stdout) !== normalise(after.stdout)) {
    console.log(`[change] ${file} differs beyond its timestamp`);
    process.exit(0);
  }
}

console.log(`[change] ${staged.length} file(s) rewritten, but only their timestamps moved`);
process.exit(1);
