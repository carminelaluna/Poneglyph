import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const scripts = path.join(root, 'scripts');

const temps: string[] = [];
const scratch = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'poneglyph-ingest-'));
  temps.push(dir);
  return dir;
};
after(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

describe('every script can find what it imports', () => {
  it('resolves every relative import in scripts/', async () => {
    const files = (await readdir(scripts)).filter((f) => f.endsWith('.mjs'));
    assert.ok(files.length > 10, 'expected the scripts directory to hold the ingests');

    const broken: string[] = [];
    for (const file of files) {
      const source = await readFile(path.join(scripts, file), 'utf8');
      for (const m of source.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
        const target = path.resolve(scripts, m[1]);
        if (!existsSync(target)) broken.push(`${file} -> ${m[1]}`);
      }
    }
    assert.deepEqual(broken, [], 'an import points at a file that is not there');
  });

  it('keeps the extracted modules shared rather than re-inlined', async () => {
    const expected: [string, string][] = [
      ['ingest-decks.mjs', 'limitless.mjs'],
      ['ingest-matchups.mjs', 'limitless.mjs'],
      ['ingest-decks.mjs', 'deck-corpus.mjs'],
      ['ingest-matchups.mjs', 'deck-corpus.mjs'],
      ['build-indexes.mjs', 'deck-corpus.mjs'],
      ['build-indexes.mjs', 'dedupe.mjs'],
      ['ingest-topdecks.mjs', 'refusal.mjs'],
      ['ingest-spoilers.mjs', 'refusal.mjs'],
      ['ingest-topdecks.mjs', 'corpus-guard.mjs'],
    ];
    for (const [script, module] of expected) {
      const source = await readFile(path.join(scripts, script), 'utf8');
      assert.match(source, new RegExp(`from '\\./${module.replace('.', '\\.')}'`), `${script} no longer imports ${module}`);
    }
  });
});

async function fixture(dir: string) {
  await mkdir(path.join(dir, 'data'), { recursive: true });
  const write = (name: string, value: unknown) =>
    writeFile(path.join(dir, 'data', name), JSON.stringify(value));

  await write('cards.json', [
    { id: 'OP01-001', name: 'Roronoa Zoro', category: 'Leader', colors: ['Green'], setCode: 'OP01' },
    { id: 'OP01-025', name: 'Nami', category: 'Character', colors: ['Green'], setCode: 'OP01' },
  ]);
  await write('tournaments.json', [
    { id: 't1', name: 'Fixture Cup', date: '2024-05-01', players: 16, venue: 'offline', tier: 'local' },
    { id: 't2', name: 'Fixture Cup II', date: '2026-05-01', players: 8, venue: 'offline', tier: 'local' },
  ]);

  const deck = (id: string, tournamentId: string, date: string) => ({
    id,
    tournamentId,
    tournamentName: 'Fixture Cup',
    date,
    tournamentPlayers: 16,
    player: 'tester',
    country: 'IT',
    placing: 1,
    record: { wins: 3, losses: 0, ties: 0 },
    leaderId: 'OP01-001',
    leaderName: 'Roronoa Zoro',
    colors: ['Green'],
    cards: [{ id: 'OP01-025', count: 4 }],
    total: 50,
    unresolved: [],
  });

  await mkdir(path.join(dir, 'data', 'decks'), { recursive: true });
  await writeFile(
    path.join(dir, 'data', 'decks', '2024.json'),
    JSON.stringify([deck('d1', 't1', '2024-05-01')])
  );
  await writeFile(
    path.join(dir, 'data', 'decks', '2026.json'),
    JSON.stringify([deck('d2', 't2', '2026-05-01')])
  );
}

describe('ingest-decks --rebuild, offline', () => {
  it('re-derives from stored decks without a network, and keeps every one', async () => {
    const dir = await scratch();
    await fixture(dir);

    const { stdout } = await run('node', [path.join(scripts, 'ingest-decks.mjs'), '--rebuild'], {
      cwd: dir,
      timeout: 120_000,
    });

    assert.match(stdout, /rebuilding derived data from 2 stored decks/);
    assert.match(stdout, /decks -> .*2024:1.*2026:1/, 'did not write both years back');

    const years = (await readdir(path.join(dir, 'data', 'decks'))).sort();
    assert.deepEqual(years, ['2024.json', '2026.json']);

    let kept = 0;
    for (const year of years) {
      kept += JSON.parse(await readFile(path.join(dir, 'data', 'decks', year), 'utf8')).length;
    }
    assert.equal(kept, 2, 'a deck was lost on the round trip');
  });

  it('derives the files the site is built from', async () => {
    const dir = await scratch();
    await fixture(dir);
    await run('node', [path.join(scripts, 'ingest-decks.mjs'), '--rebuild'], {
      cwd: dir,
      timeout: 120_000,
    });

    for (const file of ['archetypes.json', 'card-play.json', 'decks-meta.json']) {
      assert.ok(existsSync(path.join(dir, 'data', file)), `${file} was not written`);
    }
    const archetypes = JSON.parse(
      await readFile(path.join(dir, 'data', 'archetypes.json'), 'utf8')
    );
    assert.equal(archetypes.length, 1);
    assert.equal(archetypes[0].leaderId, 'OP01-001');
  });

  it('writes no browser payload', async () => {
    const dir = await scratch();
    await fixture(dir);
    await run('node', [path.join(scripts, 'ingest-decks.mjs'), '--rebuild'], {
      cwd: dir,
      timeout: 120_000,
    });
    assert.ok(!existsSync(path.join(dir, 'public')), 'ingest-decks wrote into public/');
  });

  it('refuses clearly when the card archive is missing', async () => {
    const dir = await scratch();
    await mkdir(path.join(dir, 'data'), { recursive: true });
    await assert.rejects(
      () =>
        run('node', [path.join(scripts, 'ingest-decks.mjs'), '--rebuild'], {
          cwd: dir,
          timeout: 60_000,
        }),
      (err: { code?: number; stdout?: string; stderr?: string }) => {
        assert.equal(err.code, 1, 'expected exit 1');
        assert.match(
          `${err.stdout ?? ''}${err.stderr ?? ''}`,
          /cards\.json/i,
          'did not name what was missing'
        );
        return true;
      }
    );
  });
});
