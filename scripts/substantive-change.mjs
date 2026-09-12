#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const VOLATILE = new Set(['generatedAt', 'durationMs', 'fetchedAt', 'thisRun']);

const git = (args) => spawnSync('git', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });

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
