#!/usr/bin/env node
/**
 * The Limitless deck corpus, stored a year at a time.
 *
 * It was one file, `data/decks.json`, and at 66 MB GitHub warned on every push —
 * *"larger than GitHub's recommended maximum file size of 50.00 MB"*. That is a
 * warning; the **hard limit is 100 MB and a push over it is rejected outright**,
 * which is the day the archive stops updating rather than a day it looks untidy.
 * Measured at 1.61 MB a month, the single file reached it in about 21 months.
 *
 * A year is the unit because it makes the problem stop rather than move: a closed
 * year never grows again, and the current one gains ~19 MB before it closes. The
 * largest, 2024, is 32.7 MB. No file here can approach the limit.
 *
 * Three scripts touch this corpus — `ingest-decks.mjs` writes it and reads it back
 * as its own cache, `build-indexes.mjs` merges it, `ingest-matchups.mjs` joins
 * against it — so the layout is decided here and not in three places. That is the
 * same reason `limitless.mjs` holds one rate limiter and `dedupe.mjs` one set of
 * keys.
 */

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Where the years live, relative to the data directory. */
export const DECKS_DIR = 'decks';

/** The single file this replaced. Read if present, removed once years are written. */
export const LEGACY_FILE = 'decks.json';

/**
 * A deck's year, or `unknown`.
 *
 * Never dropped for want of a date. A row with no usable one is a row the archive
 * holds and would otherwise lose on the next round trip, which is a silent way to
 * shrink a corpus — the failure `corpus-guard.mjs` exists for, arriving through
 * the back door.
 */
export function yearOf(deck) {
  const year = String(deck?.date ?? '').slice(0, 4);
  return /^\d{4}$/.test(year) ? year : 'unknown';
}

/**
 * Every deck on record, from the year files and from the legacy one if it is still
 * there.
 *
 * Both, deliberately: a checkout that has not re-ingested since the split still has
 * the old file, and reading only the new layout would report an empty archive to a
 * `build-indexes` run that then writes empty payloads over live ones. Reading both
 * makes the migration a non-event — the first write removes the legacy file.
 */
export async function readDecks(dataDir) {
  const decks = [];

  const legacy = path.join(dataDir, LEGACY_FILE);
  try {
    decks.push(...JSON.parse(await readFile(legacy, 'utf8')));
  } catch {
    /* Absent after the first write, which is the expected state. */
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

/**
 * Write them back, one file per year, and remove the single file if it is there.
 *
 * Sorted within a year by date then id, so two runs over the same data produce
 * byte-identical files. That is not tidiness: `substantive-change.mjs` decides
 * whether to commit by diffing, and an unstable order would make every ingest look
 * like a change, rebuilding and redeploying the whole site to reshuffle a file.
 *
 * Returns what it wrote, so a caller can log it and a test can check it.
 */
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

  /*
   * A year that emptied — every row moved or the corpus was rebuilt smaller — must
   * lose its file, or `readDecks` would keep handing back rows nothing wrote.
   */
  const keep = new Set(written.map((w) => `${w.year}.json`));
  try {
    for (const file of await readdir(dir)) {
      if (file.endsWith('.json') && !keep.has(file)) await rm(path.join(dir, file));
    }
  } catch {
    /* The directory was just created; nothing to prune. */
  }

  /* Last, so a crash mid-write leaves the old file rather than nothing. */
  await rm(path.join(dataDir, LEGACY_FILE), { force: true });

  return written;
}
