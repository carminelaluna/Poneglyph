#!/usr/bin/env node
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DECKS_DIR = 'decks';

export const LEGACY_FILE = 'decks.json';

export function yearOf(deck) {
  const year = String(deck?.date ?? '').slice(0, 4);
  return /^\d{4}$/.test(year) ? year : 'unknown';
}

export async function readDecks(dataDir) {
  const decks = [];

  const legacy = path.join(dataDir, LEGACY_FILE);
  try {
    decks.push(...JSON.parse(await readFile(legacy, 'utf8')));
  } catch {
  }

  const dir = path.join(dataDir, DECKS_DIR);
  let files = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return decks;
  }

  for (const file of files) {
    decks.push(...JSON.parse(await readFile(path.join(dir, file), 'utf8')));
  }
  return decks;
}

export async function writeDecks(dataDir, decks) {
  const byYear = new Map();
  for (const deck of decks) {
    const year = yearOf(deck);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(deck);
  }

  const dir = path.join(dataDir, DECKS_DIR);
  await mkdir(dir, { recursive: true });

  const written = [];
  for (const [year, list] of [...byYear.entries()].sort()) {
    list.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
    await writeFile(path.join(dir, `${year}.json`), JSON.stringify(list));
    written.push({ year, decks: list.length });
  }

  const keep = new Set(written.map((w) => `${w.year}.json`));
  try {
    for (const file of await readdir(dir)) {
      if (file.endsWith('.json') && !keep.has(file)) await rm(path.join(dir, file));
    }
  } catch {
  }

  await rm(path.join(dataDir, LEGACY_FILE), { force: true });

  return written;
}
