/**
 * The three functions that exist twice, checked against each other.
 *
 * `shardOf`, `playerSlugOf` and the not-a-player list are written once in
 * `scripts/build-indexes.mjs` (which writes the payloads) and again in
 * `src/lib/shards.ts` / `src/lib/meta.ts` (which read them). They are duplicated on
 * purpose — a build script cannot import a browser module here — and CLAUDE.md says
 * what happens when they drift: every lookup lands in the wrong bucket and every
 * event, player and deck page reads "not found". Nothing fails loudly.
 *
 * So this test does not import the script. It lifts the source text of each copy
 * and runs the two against the same keys, which is the drift the comment warns
 * about. The last case goes further and checks the payloads actually on disk, since
 * agreeing implementations still miss if the files were written by an older one.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { isNamedPlayer, playerSlug } from '../src/lib/meta.ts';
import { toEvent, toPlayer, type EventRow, type PlayerRow } from '../src/lib/directory.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = (file: string) => readFile(path.join(root, file), 'utf8');

/* ------------------------------------------------------------- extraction */

/** The body of `function name(...) { … }`, by balancing braces from the first one. */
function functionBody(source: string, name: string): string {
  const at = source.indexOf(`function ${name}(`);
  assert.notEqual(at, -1, `${name} is not declared in this file any more`);
  const open = source.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`unbalanced braces in ${name}`);
}

/** The initialiser of `const name = … ;`, by scanning to the semicolon at depth 0. */
function constExpression(source: string, name: string): string {
  const at = source.indexOf(`const ${name} = `);
  assert.notEqual(at, -1, `${name} is not declared in this file any more`);
  let depth = 0;
  for (let i = at; i < source.length; i++) {
    const ch = source[i];
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ';' && depth === 0) {
      return source.slice(source.indexOf('=', at) + 1, i);
    }
  }
  throw new Error(`no terminating semicolon for ${name}`);
}

const compile = <T>(body: string, ...params: string[]): T =>
  new Function(...params, body) as T;

/* ------------------------------------------------------------------- keys */

/** Real keys, plus the shapes that break naive string handling. */
async function sampleKeys(): Promise<string[]> {
  const edges = [
    '',
    'a',
    'OP01-025',
    'l-6a8e16d97a62de813013f299',
    't-en-2026-08-25-cardshop',
    'Ricardo Muñoz',
    'ヤマト',
    'Ric  Masterflash',
    '---',
    'x'.repeat(200),
    'ÅÄÖ åäö',
    '🏴‍☠️ pirate',
  ];

  const file = path.join(root, 'data', 'decks-merged.json');
  if (!existsSync(file)) return edges;

  const corpus = JSON.parse(await readFile(file, 'utf8')) as {
    decks: { id: string; player: string; eventId: string }[];
  };
  /* Every 7th row, so the sample spans the whole corpus rather than one event. */
  const real: string[] = [];
  for (let i = 0; i < corpus.decks.length; i += 7) {
    const deck = corpus.decks[i];
    real.push(deck.id, deck.eventId, deck.player ?? '');
  }
  return [...edges, ...real];
}

/* ------------------------------------------------------------------ tests */

describe('shardOf', () => {
  it('agrees between the build script and the browser copy', async () => {
    const script = await read('scripts/build-indexes.mjs');
    const lib = await read('src/lib/shards.ts');

    /*
     * The script reads its bucket count from a constant and the browser copy has
     * the number written in. Carrying the declaration over is what makes changing
     * SHARDS on one side show up here as a mismatch rather than as a silent
     * re-bucketing of every payload.
     */
    const shards = constExpression(script, 'SHARDS');
    const fromScript = compile<(key: string) => string>(
      `const SHARDS = ${shards};\n${functionBody(script, 'shardOf')}`,
      'key'
    );
    const fromLib = compile<(key: string) => string>(functionBody(lib, 'shardOf'), 'key');

    const keys = await sampleKeys();
    assert.ok(keys.length > 12, 'no keys to compare');
    for (const key of keys) {
      assert.equal(fromScript(key), fromLib(key), `shard disagreement on ${JSON.stringify(key)}`);
    }
  });

  /*
   * The width and the range both matter, and they moved together: 64 buckets fitted
   * two digits, 256 needs three. Reading the count out of the script rather than
   * writing it here again is what keeps this test true the next time the corpus
   * outgrows its shards.
   */
  it('answers with a fixed-width bucket inside the range', async () => {
    const script = await read('scripts/build-indexes.mjs');
    const lib = await read('src/lib/shards.ts');
    const shards = Number(constExpression(script, 'SHARDS'));
    const shardOf = compile<(key: string) => string>(functionBody(lib, 'shardOf'), 'key');

    assert.ok(shards > 0, 'SHARDS is not a number any more');
    const width = String(shards - 1).length;

    for (const key of await sampleKeys()) {
      const bucket = shardOf(key);
      assert.equal(bucket.length, width, `bucket ${bucket} is not ${width} characters`);
      assert.ok(Number(bucket) >= 0 && Number(bucket) < shards);
    }
  });
});

describe('playerSlugOf', () => {
  it('agrees with playerSlug in lib/meta.ts', async () => {
    const script = await read('scripts/build-indexes.mjs');
    const fromScript = compile<(name: string) => string>(
      `return (${constExpression(script, 'playerSlugOf')})(name);`,
      'name'
    );

    for (const key of await sampleKeys()) {
      assert.equal(fromScript(key), playerSlug(key), `slug disagreement on ${JSON.stringify(key)}`);
    }
  });

  /*
   * Not the script's own `slugify`, which truncates at 48. Reusing that one would
   * quietly break every handle longer than 48 characters, which is the kind of bug
   * that only shows up for one unlucky person.
   */
  it('truncates at 64, not at 48', () => {
    assert.equal(playerSlug('a'.repeat(120)).length, 64);
  });
});

describe('the not-a-player list', () => {
  it('agrees between the build script and lib/meta.ts', async () => {
    const script = await read('scripts/build-indexes.mjs');

    /* Both are arrows in the script, so the initialiser is what gets compiled. */
    const named = compile<(name: string) => boolean>(
      `const NOT_A_PLAYER = ${constExpression(script, 'NOT_A_PLAYER')};\n` +
        `return (${constExpression(script, 'namedPlayer')})(name);`,
      'name'
    );

    const cases = [
      'NA', 'na', 'N/A', 'unknown', 'none', 'null', 'nan', '-', '--', '?', '??',
      'anon', 'anonymous', 'Player not recorded', '', '   ',
      'Nahuel Del muro', 'aku01', 'Anonymous Pirate',
    ];
    for (const name of cases) {
      assert.equal(named(name), isNamedPlayer(name), `disagreement on ${JSON.stringify(name)}`);
    }
    assert.equal(isNamedPlayer('NA'), false);
    assert.equal(isNamedPlayer('aku01'), true);
  });
});

describe('the payloads on disk', () => {
  it('holds each sampled deck in the bucket the browser will ask for', async (t) => {
    const dir = path.join(root, 'public', 'data', 'deck');
    if (!existsSync(dir)) return t.skip('no payloads built yet — run npm run build:indexes');

    const lib = await read('src/lib/shards.ts');
    const shardOf = compile<(key: string) => string>(functionBody(lib, 'shardOf'), 'key');

    const merged = path.join(root, 'data', 'decks-merged.json');
    if (!existsSync(merged)) return t.skip('no corpus on this checkout');
    const corpus = JSON.parse(await readFile(merged, 'utf8')) as { decks: { id: string }[] };

    /* Enough to catch a whole-file drift without reading all 64 buckets. */
    const step = Math.max(1, Math.floor(corpus.decks.length / 40));
    const buckets = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < corpus.decks.length; i += step) {
      const id = corpus.decks[i].id;
      const bucket = shardOf(id);
      if (!buckets.has(bucket)) {
        const file = path.join(dir, `${bucket}.json`);
        assert.ok(existsSync(file), `bucket ${bucket}.json was never written`);
        buckets.set(bucket, JSON.parse(await readFile(file, 'utf8')));
      }
      assert.ok(buckets.get(bucket)![id], `${id} is missing from deck/${bucket}.json`);
    }
  });
});

/*
 * The directory payloads are arrays, read back positionally by lib/directory.ts.
 * A column inserted on one side and not the other does not throw: it renders a
 * venue where a tier should be and a date in the games column, which looks like a
 * styling bug rather than like the data being read wrong.
 *
 * So this checks the values, not the shape. A date that parses as a date and a
 * slug that matches the name beside it can only both be true if every position
 * lines up.
 */
describe('the directory payloads', () => {
  const dated = /^\d{4}-\d{2}-\d{2}$/;
  /*
   * `OP01-001` and also `P-117`: the promo Leaders carry no set number, and three
   * of the 139 archetypes in the corpus are one of those.
   */
  const cardId = /^[A-Z]{1,4}\d{0,2}-\d{3}$/;

  it('reads tournament rows back into the fields they were written from', async (t) => {
    const file = path.join(root, 'public', 'data', 'tournaments-index.json');
    if (!existsSync(file)) return t.skip('no payloads built yet');
    const index = JSON.parse(await readFile(file, 'utf8')) as { events: EventRow[]; total: number };

    assert.ok(index.events.length > 0, 'no events listed');
    for (const row of index.events) {
      const event = toEvent(row);
      assert.ok(event.id.length > 0, 'an event has no id');
      assert.equal(typeof event.name, 'string');
      assert.match(event.date, dated, `bad date on ${event.id}`);
      assert.ok(event.region === 'en' || event.region === 'jp', `bad region on ${event.id}`);
      assert.ok(Number.isInteger(event.recorded) && event.recorded > 0);
      assert.ok(Number.isInteger(event.entrants) && event.entrants >= 0);
      if (event.winner) assert.match(event.winner, cardId, `bad winner on ${event.id}`);
    }
  });

  it('reads player rows back into the fields they were written from', async (t) => {
    const file = path.join(root, 'public', 'data', 'players-index.json');
    if (!existsSync(file)) return t.skip('no payloads built yet');
    const index = JSON.parse(await readFile(file, 'utf8')) as {
      players: PlayerRow[];
      minResults: number;
    };

    assert.ok(index.players.length > 0, 'no players listed');
    for (const row of index.players) {
      const player = toPlayer(row);
      /*
       * The strongest of these: the slug was derived from a spelling of this name,
       * so if the two columns ever drifted apart this is what would catch it — and
       * every link on the page would be pointing at a shard that has nothing in it.
       */
      assert.equal(player.slug, playerSlug(player.name), `slug and name disagree: ${player.slug}`);
      assert.ok(isNamedPlayer(player.name), `${player.name} is a placeholder, not a player`);
      assert.ok(player.results >= index.minResults);
      assert.ok(player.events <= player.results, `${player.slug} has more events than results`);
      assert.ok(player.top8 <= player.results);
      assert.ok(player.firsts <= player.top8, `${player.slug} has more wins than top eights`);
      assert.match(player.last, dated);
      assert.match(player.main, cardId);
      assert.ok(['en', 'jp', 'both'].includes(player.regions));
    }
  });
});
