/**
 * Storing the deck corpus a year at a time.
 *
 * What this stands between is the archive and a silent shrink: every one of these
 * cases is a row that could be dropped on a round trip without anything failing,
 * which is the shape of the bug `corpus-guard.mjs` exists for arriving through the
 * back door instead of from an upstream.
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { DECKS_DIR, LEGACY_FILE, readDecks, writeDecks, yearOf } from '../scripts/deck-corpus.mjs';

const temps: string[] = [];
const scratch = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'poneglyph-corpus-'));
  temps.push(dir);
  return dir;
};

after(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

const deck = (id: string, date: string) => ({ id, date, leaderId: 'OP01-001' });

describe('which year a deck belongs to', () => {
  it('reads the year off the date', () => {
    assert.equal(yearOf(deck('a', '2024-06-01')), '2024');
    assert.equal(yearOf(deck('a', '2024-06-01T18:30:00.000Z')), '2024');
  });

  /*
   * Never dropped for want of a date. A row with no usable one still belongs to
   * the archive, and bucketing it as `unknown` is the difference between keeping
   * it and losing it on the next round trip.
   */
  it('files a deck with no usable date under unknown rather than losing it', () => {
    assert.equal(yearOf(deck('a', '')), 'unknown');
    assert.equal(yearOf(deck('a', 'not a date')), 'unknown');
    assert.equal(yearOf({} as never), 'unknown');
    assert.equal(yearOf(undefined as never), 'unknown');
  });
});

describe('a round trip', () => {
  it('gives back every deck it was given', async () => {
    const dir = await scratch();
    const decks = [
      deck('a', '2023-01-05'),
      deck('b', '2024-11-30'),
      deck('c', '2024-02-02'),
      deck('d', '2026-09-01'),
      deck('e', ''),
    ];
    await writeDecks(dir, decks);
    const back = await readDecks(dir);
    assert.equal(back.length, decks.length);
    assert.deepEqual(
      back.map((d) => d.id).sort(),
      decks.map((d) => d.id).sort()
    );
  });

  it('writes one file per year, and one for the undated', async () => {
    const dir = await scratch();
    await writeDecks(dir, [deck('a', '2023-01-05'), deck('b', '2024-01-05'), deck('c', '')]);
    const files = (await readdir(path.join(dir, DECKS_DIR))).sort();
    assert.deepEqual(files, ['2023.json', '2024.json', 'unknown.json']);
  });

  /*
   * Two runs over the same data must produce identical bytes.
   * `substantive-change.mjs` decides whether to commit by diffing, so an unstable
   * order would make every ingest look like a change and rebuild the whole site
   * to reshuffle a file.
   */
  it('is byte-identical when written twice', async () => {
    const dir = await scratch();
    const decks = [deck('c', '2024-05-05'), deck('a', '2024-05-05'), deck('b', '2024-01-01')];
    await writeDecks(dir, decks);
    const first = await readFile(path.join(dir, DECKS_DIR, '2024.json'), 'utf8');
    await writeDecks(dir, [...decks].reverse());
    const second = await readFile(path.join(dir, DECKS_DIR, '2024.json'), 'utf8');
    assert.equal(first, second, 'the order the rows arrived in leaked into the file');
  });
});

describe('the migration from one file', () => {
  /*
   * A checkout that has not re-ingested still has decks.json. Reading only the new
   * layout would report an empty archive to a build-indexes run, which would then
   * write empty payloads over live ones.
   */
  it('reads the legacy file when the years are not there yet', async () => {
    const dir = await scratch();
    await writeFile(path.join(dir, LEGACY_FILE), JSON.stringify([deck('a', '2024-01-01')]));
    const back = await readDecks(dir);
    assert.deepEqual(back.map((d) => d.id), ['a']);
  });

  it('reads both while the two coexist', async () => {
    const dir = await scratch();
    await writeFile(path.join(dir, LEGACY_FILE), JSON.stringify([deck('old', '2023-01-01')]));
    await mkdir(path.join(dir, DECKS_DIR), { recursive: true });
    await writeFile(
      path.join(dir, DECKS_DIR, '2024.json'),
      JSON.stringify([deck('new', '2024-01-01')])
    );
    const back = await readDecks(dir);
    assert.deepEqual(back.map((d) => d.id).sort(), ['new', 'old']);
  });

  it('removes the legacy file once the years are written', async () => {
    const dir = await scratch();
    await writeFile(path.join(dir, LEGACY_FILE), JSON.stringify([deck('a', '2024-01-01')]));
    const held = await readDecks(dir);
    await writeDecks(dir, held);
    await assert.rejects(() => readFile(path.join(dir, LEGACY_FILE), 'utf8'));
    assert.deepEqual((await readDecks(dir)).map((d) => d.id), ['a'], 'and it is not lost');
  });

  /*
   * A year that empties must lose its file, or readDecks keeps handing back rows
   * that nothing wrote — an archive that grows when the corpus shrinks.
   */
  it('prunes a year that no longer has any decks', async () => {
    const dir = await scratch();
    await writeDecks(dir, [deck('a', '2023-01-01'), deck('b', '2024-01-01')]);
    await writeDecks(dir, [deck('b', '2024-01-01')]);
    assert.deepEqual(await readdir(path.join(dir, DECKS_DIR)), ['2024.json']);
    assert.deepEqual((await readDecks(dir)).map((d) => d.id), ['b']);
  });
});

describe('an archive that is not there', () => {
  it('is empty rather than throwing', async () => {
    assert.deepEqual(await readDecks(await scratch()), []);
  });

  it('writes nothing for no decks, and reads nothing back', async () => {
    const dir = await scratch();
    assert.deepEqual(await writeDecks(dir, []), []);
    assert.deepEqual(await readDecks(dir), []);
  });
});
