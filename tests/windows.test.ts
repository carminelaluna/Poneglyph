/**
 * What a time window covers.
 *
 * The era window is the one that had this wrong. "Since ST-01 entered play" meant
 * everything from December 2022 to today, so picking a release from 2022 answered
 * with decks from 2026 — sets that did not exist when that release was current.
 * An era now runs until the next *expansion* arrived: a starter deck does not end
 * a format, and ending on one made OP-01 a window one day wide.
 *
 * `lib/meta.ts` is free of imports, so all of this runs against a fabricated index
 * rather than against whatever the ingest happens to hold.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterDecks,
  windowEnd,
  windowLabel,
  windowStart,
  type MetaDeck,
  type MetaIndex,
} from '../src/lib/meta.ts';

const deck = (id: string, day: string): MetaDeck => ({
  i: id,
  l: 'OP01-001',
  d: day,
  p: 1,
  w: 3,
  s: 0,
  t: 0,
  n: 8,
  e: 'Event',
  v: 'offline',
  k: 'local',
  a: 'someone',
  f: 1,
});

/* Newest first, which is how build-indexes writes them. Two sets share a day. */
const index: MetaIndex = {
  generatedAt: '2026-08-28T00:00:00.000Z',
  window: { from: '2022-12-02', to: '2026-08-28' },
  eras: [
    { code: 'OP-03', set: 'OP03', from: '2024-01-01', kind: 'Expansion', decks: 10 },
    { code: 'OP-02', set: 'OP02', from: '2023-06-01', kind: 'Expansion', decks: 10 },
    { code: 'ST-02', set: 'ST02', from: '2023-06-01', kind: 'Starter deck', decks: 10 },
    { code: 'ST-01', set: 'ST01', from: '2023-01-15', kind: 'Starter deck', decks: 10 },
    { code: 'OP-01', set: 'OP01', from: '2022-12-02', kind: 'Expansion', decks: 10 },
  ],
  tiers: [{ id: 'local', label: 'Local' }],
  leaders: {},
  cards: {},
  decks: [
    deck('a', '2022-12-05'),
    deck('b', '2023-05-31'),
    deck('c', '2023-06-01'),
    deck('d', '2023-12-31'),
    deck('e', '2024-01-01'),
    deck('f', '2026-08-20'),
  ],
};

const ids = (rows: MetaDeck[]) => rows.map((r) => r.i).sort();

describe('an era window', () => {
  it('stops when the next expansion arrived', () => {
    assert.equal(windowStart({ kind: 'era', set: 'OP01' }, index), '2022-12-02');
    assert.equal(windowEnd({ kind: 'era', set: 'OP01' }, index), '2023-06-01');
  });

  /*
   * The bug, stated as a test: the oldest release must not answer with the whole
   * archive. Decks from 2024 and 2026 are sets that did not exist yet.
   */
  it('does not answer the oldest release with everything since', () => {
    const rows = filterDecks(index, { kind: 'era', set: 'OP01' });
    assert.deepEqual(ids(rows), ['a', 'b']);
  });

  /* The day the next set arrived belongs to the next era, not this one. */
  it('excludes the day the next set entered play', () => {
    const rows = filterDecks(index, { kind: 'era', set: 'OP01' });
    assert.ok(!ids(rows).includes('c'), 'the boundary day leaked into the earlier era');
    assert.ok(ids(filterDecks(index, { kind: 'era', set: 'OP02' })).includes('c'));
  });

  /*
   * The rule that makes the window mean something. A starter deck arriving does
   * not end a format — ending on any set at all made OP-01 one day wide, because
   * three products entered play inside 48 hours at the start of the archive.
   */
  it('is not ended by a starter deck released in the middle of it', () => {
    assert.equal(windowEnd({ kind: 'era', set: 'OP01' }, index), '2023-06-01');
    const rows = ids(filterDecks(index, { kind: 'era', set: 'OP01' }));
    assert.deepEqual(rows, ['a', 'b'], 'the ST-01 release cut the OP-01 era short');
  });

  /*
   * Sets can land on one day — three starter decks together, or a starter beside
   * an expansion. The end has to be the next expansion date that is actually
   * later, not whichever entry happens to sit next in the list.
   */
  it('is not ended by another set released the same day', () => {
    assert.equal(windowEnd({ kind: 'era', set: 'OP02' }, index), '2024-01-01');
    assert.equal(windowEnd({ kind: 'era', set: 'ST02' }, index), '2024-01-01');
    assert.deepEqual(ids(filterDecks(index, { kind: 'era', set: 'OP02' })), ['c', 'd']);
  });

  /* The newest era is still going on, so it has no end. */
  it('leaves the newest era open', () => {
    assert.equal(windowEnd({ kind: 'era', set: 'OP03' }, index), null);
    assert.deepEqual(ids(filterDecks(index, { kind: 'era', set: 'OP03' })), ['e', 'f']);
  });

  it('says which of the two it is', () => {
    assert.equal(windowLabel({ kind: 'era', set: 'OP01' }, index), 'While OP-01 was current');
    assert.equal(windowLabel({ kind: 'era', set: 'OP03' }, index), 'Since OP-03 entered play');
  });

  it('has nothing to say about a set it does not know', () => {
    assert.equal(windowStart({ kind: 'era', set: 'NOPE' }, index), null);
    assert.equal(windowEnd({ kind: 'era', set: 'NOPE' }, index), null);
  });
});

describe('the other windows', () => {
  it('has no end, so it runs to the newest deck on record', () => {
    assert.equal(windowEnd({ kind: 'all' }, index), null);
    assert.equal(windowEnd({ kind: 'days', days: 30 }, index), null);
  });

  it('counts days back from the newest deck, not from today', () => {
    assert.equal(windowStart({ kind: 'days', days: 7 }, index), '2026-08-22');
    assert.deepEqual(ids(filterDecks(index, { kind: 'days', days: 7 })), []);
    assert.deepEqual(ids(filterDecks(index, { kind: 'days', days: 30 })), ['f']);
  });

  it('takes everything when there is no window at all', () => {
    assert.equal(filterDecks(index, { kind: 'all' }).length, index.decks.length);
  });
});
