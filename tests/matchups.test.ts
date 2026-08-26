/**
 * Reading a bracket into Leader-against-Leader results.
 *
 * This is where a matchup goes quietly wrong. Every failure below produces a real
 * number on a real page — a deck that looks 60% against something it is even with,
 * a bye counted as a win, an archetype credited with a match it never played — and
 * none of them throws.
 *
 * The last suite checks the built payloads instead of the functions: a match is
 * stored twice, once from each side, and if the two ever disagreed the site would
 * report a matchup and its opposite as both winning.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { A_WON, B_WON, DRAW, flip, toRows } from '../scripts/matchups.mjs';

const root = path.resolve(import.meta.dirname, '..');

type Pairing = {
  round?: number;
  player1?: string | null;
  player2?: string | null;
  winner?: string | null;
};

const read = toRows as (
  pairings: Pairing[],
  leaderByPlayer: Map<string, string>
) => { rows: [string, string, number][]; unknown: number; mirrors: number };

/** Two players with decklists on record, and one without. */
const field = new Map([
  ['aku01', 'OP13-001'],
  ['el_tom', 'OP09-051'],
  ['nami22', 'OP13-001'],
]);

describe('toRows', () => {
  it('reads a decided match from the first player’s side', () => {
    const { rows } = read([{ player1: 'aku01', player2: 'el_tom', winner: 'aku01' }], field);
    assert.deepEqual(rows, [['OP13-001', 'OP09-051', A_WON]]);
  });

  it('reads a loss as a loss, not as an absent win', () => {
    const { rows } = read([{ player1: 'aku01', player2: 'el_tom', winner: 'el_tom' }], field);
    assert.deepEqual(rows, [['OP13-001', 'OP09-051', B_WON]]);
  });

  /*
   * A timed round that ended level, a double loss, a result never published: both
   * decks failed to win it, and that is what a draw is. Counting it as a loss for
   * whoever happens to be player1 would bias every archetype by table position.
   */
  it('counts anything that is not one of the two names as a draw', () => {
    for (const winner of [null, '', 'someone_else', undefined]) {
      const { rows } = read([{ player1: 'aku01', player2: 'el_tom', winner }], field);
      assert.deepEqual(rows, [['OP13-001', 'OP09-051', DRAW]], `winner: ${String(winner)}`);
    }
  });

  it('is not confused by the case a username is written in', () => {
    const { rows } = read([{ player1: 'AKU01', player2: 'El_Tom', winner: 'Aku01' }], field);
    assert.deepEqual(rows, [['OP13-001', 'OP09-051', A_WON]]);
  });

  /*
   * Limitless publishes pairings for everyone who turned up and decklists only for
   * those who submitted one. The missing side is genuinely unknown, and inventing
   * an archetype for it would put matches on a deck that never sat at that table.
   */
  it('drops a match whose other side has no decklist on record', () => {
    const { rows, unknown } = read(
      [
        { player1: 'aku01', player2: 'stranger', winner: 'aku01' },
        { player1: 'stranger', player2: 'aku01', winner: 'aku01' },
      ],
      field
    );
    assert.deepEqual(rows, []);
    assert.equal(unknown, 2);
  });

  /* A bye has no opponent: nobody beat anybody. */
  it('drops a bye', () => {
    const { rows, unknown } = read([{ player1: 'aku01', player2: null, winner: 'aku01' }], field);
    assert.deepEqual(rows, []);
    assert.equal(unknown, 1);
  });

  /* A deck beats itself half the time by construction. */
  it('drops a mirror', () => {
    const { rows, mirrors } = read(
      [{ player1: 'aku01', player2: 'nami22', winner: 'aku01' }],
      field
    );
    assert.deepEqual(rows, []);
    assert.equal(mirrors, 1);
  });

  it('takes nothing badly', () => {
    assert.deepEqual(read([], field).rows, []);
    assert.deepEqual(read(undefined as unknown as Pairing[], field).rows, []);
    assert.deepEqual(read([{}], field).rows, []);
  });
});

describe('flip', () => {
  it('turns a win into a loss and back', () => {
    assert.equal(flip(A_WON), B_WON);
    assert.equal(flip(B_WON), A_WON);
  });

  it('leaves a draw alone — it is a draw from both sides', () => {
    assert.equal(flip(DRAW), DRAW);
  });

  it('is its own inverse', () => {
    for (const r of [A_WON, B_WON, DRAW]) assert.equal(flip(flip(r)), r);
  });
});

describe('the matchup payloads', () => {
  it('tells the same story from both sides', async (t) => {
    const dir = path.join(root, 'public', 'data', 'matchups');
    if (!existsSync(dir)) return t.skip('no matchups built — run npm run ingest:matchups');

    const { readdirSync } = await import('node:fs');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    if (files.length === 0) return t.skip('no matchups built');

    /* 'A|B' -> [wins, losses, draws], as A's own file reports them. */
    const tally = new Map<string, [number, number, number]>();

    for (const file of files) {
      const leader = file.replace(/\.json$/, '');
      const payload = JSON.parse(await readFile(path.join(dir, file), 'utf8')) as {
        days: string[];
        rows: [number, string, number][];
      };

      for (const [day, opponent, result] of payload.rows) {
        assert.ok(payload.days[day], `${file} points at a day it does not carry`);
        assert.notEqual(opponent, leader, `${file} lists a mirror`);
        assert.ok([A_WON, B_WON, DRAW].includes(result), `${file} has result ${result}`);

        const key = `${leader}|${opponent}`;
        const held = tally.get(key) ?? [0, 0, 0];
        held[result === A_WON ? 0 : result === B_WON ? 1 : 2]++;
        tally.set(key, held);
      }
    }

    assert.ok(tally.size > 0, 'no matchups to compare');

    for (const [key, mine] of tally) {
      const [a, b] = key.split('|');
      const theirs = tally.get(`${b}|${a}`);
      assert.ok(theirs, `${b} has no record of playing ${a}`);
      assert.deepEqual(
        [theirs![1], theirs![0], theirs![2]],
        mine,
        `${a} and ${b} disagree about their matchup`
      );
    }
  });
});
