/**
 * Deciding that two rows are one deck.
 *
 * This is the test that stands between the archive and counting a decklist twice,
 * and — more dangerously — between it and dropping a real second event. Both
 * mistakes are silent: a share moves and nothing says why.
 *
 * The cases below are the shapes the corpus actually holds, not invented ones.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fieldSize,
  indexOf,
  listKey,
  looseKey,
  MIN_FIELD,
  recordedAs,
  withoutRecorded,
} from '../scripts/dedupe.mjs';

type Deck = Record<string, unknown>;

const deck = (over: Deck = {}): Deck => ({
  date: '2026-08-19',
  player: 'mstrkenc',
  leaderId: 'OP16-001',
  eventName: '[OP17] ChinoizeCup #99 Wednesday',
  players: 128,
  cards: [
    { id: 'OP01-025', count: 4 },
    { id: 'OP16-015', count: 4 },
  ],
  ...over,
});

const index = (rows: Deck[]) => indexOf(rows as never[]);
const asked = (d: Deck, i: ReturnType<typeof index>) => recordedAs(d as never, i);

describe('the keys', () => {
  it('reads a player the same however it was typed', () => {
    assert.equal(looseKey(deck({ player: ' MstrKenc ' }) as never), looseKey(deck() as never));
  });

  it('reads a Limitless timestamp and a plain day as one date', () => {
    assert.equal(
      looseKey(deck({ date: '2026-08-19T18:30:00.000Z' }) as never),
      looseKey(deck() as never)
    );
  });

  /* Sources list the fifty in whatever order they please; the deck is the same. */
  it('does not care what order the fifty arrived in', () => {
    const shuffled = deck({
      cards: [
        { id: 'OP16-015', count: 4 },
        { id: 'OP01-025', count: 4 },
      ],
    });
    assert.equal(listKey(shuffled as never), listKey(deck() as never));
  });

  it('separates two players at one event, and one player at two', () => {
    assert.notEqual(looseKey(deck({ player: 'uzzy' }) as never), looseKey(deck() as never));
    assert.notEqual(looseKey(deck({ leaderId: 'OP05-041' }) as never), looseKey(deck() as never));
  });
});

describe('how big the field was', () => {
  it('takes a reported entrant count', () => {
    assert.equal(fieldSize(deck({ players: 128 }) as never), 128);
  });

  /* Top Decks does not report entrants and writes the number into the name. */
  it('reads the number Top Decks puts in the event name', () => {
    assert.equal(fieldSize(deck({ players: 0, eventName: 'ChinoizeCup(128)' }) as never), 128);
  });

  it('is null rather than zero when nobody said', () => {
    assert.equal(fieldSize(deck({ players: 0, eventName: 'LGS' }) as never), null);
    assert.equal(fieldSize({} as never), null);
  });

  /*
   * A parenthesised number smaller than a readable field is not a field: a year, a
   * shop's branch. Every one of the 1,154 real ones is at or above MIN_FIELD.
   */
  it('refuses a number too small to be a field', () => {
    assert.equal(fieldSize(deck({ players: 0, eventName: 'Store (3)' }) as never), null);
    assert.equal(
      fieldSize(deck({ players: 0, eventName: `Store (${MIN_FIELD})` }) as never),
      MIN_FIELD
    );
  });
});

describe('is this deck already recorded', () => {
  const held = index([deck()]);

  it('says so when the fifty cards match', () => {
    assert.equal(asked(deck({ eventName: 'ChinoizeCup(128)', players: 0 }), held), 'list');
  });

  /*
   * The case this was written for. Same day, player and Leader; the lists differ by
   * one card because two sources typed the same deck; the field size says it is one
   * event. 23 of the 39 in the corpus differ by exactly this much.
   */
  it('says so when the lists differ but the event is the same size', () => {
    const topDecks = deck({
      players: 0,
      eventName: 'ChinoizeCup(128)',
      cards: [
        { id: 'OP01-025', count: 4 },
        { id: 'OP12-015', count: 4 },
      ],
    });
    assert.equal(asked(topDecks, held), 'event');
  });

  /*
   * The mistake worth fearing. A player really does bring one archetype to two
   * events in a day — 354 times inside Limitless alone — and the second event is
   * a different size. Nothing may drop it.
   */
  it('keeps a second event of a different size on the same day', () => {
    const later = deck({
      players: 0,
      eventName: 'Evening Cup(32)',
      cards: [{ id: 'OP01-025', count: 4 }],
    });
    assert.equal(asked(later, held), null);
  });

  it('keeps a row whose event size nobody recorded', () => {
    const unnamed = deck({ players: 0, eventName: 'LGS', cards: [{ id: 'OP01-025', count: 4 }] });
    assert.equal(asked(unnamed, held), null);
  });

  it('keeps another player at the very same event', () => {
    assert.equal(asked(deck({ player: 'uzzy', players: 0, eventName: 'X(128)' }), held), null);
  });

  it('keeps the same player on another day', () => {
    assert.equal(asked(deck({ date: '2026-08-20', players: 0, eventName: 'X(128)' }), held), null);
  });

  /*
   * An event whose entrant count was never recorded must not become a field size of
   * zero that matches every other unrecorded event.
   */
  it('does not let two unrecorded field sizes match each other', () => {
    const blank = index([deck({ players: 0, eventName: 'LGS' })]);
    const other = deck({
      players: 0,
      eventName: 'Bear Cave',
      cards: [{ id: 'OP01-025', count: 4 }],
    });
    assert.equal(asked(other, blank), null);
  });
});

describe('splitting a batch', () => {
  it('counts why each row went', () => {
    const held = index([deck()]);
    const { kept, dropped } = withoutRecorded(
      [
        deck(),
        deck({ players: 0, eventName: 'ChinoizeCup(128)', cards: [{ id: 'OP12-015', count: 4 }] }),
        deck({ date: '2026-09-01', players: 0, eventName: 'LGS' }),
      ] as never[],
      held
    );
    assert.equal(dropped.list, 1);
    assert.equal(dropped.event, 1);
    assert.equal(kept.length, 1);
  });

  it('keeps everything against an empty corpus', () => {
    const { kept, dropped } = withoutRecorded([deck()] as never[], index([]));
    assert.equal(kept.length, 1);
    assert.deepEqual(dropped, { list: 0, event: 0 });
  });
});
