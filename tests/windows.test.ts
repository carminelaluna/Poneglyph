import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  archiveMonthsFor,
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

const months = (() => {
  const out: string[] = [];
  for (let y = 2022; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      if (key < '2022-12' || key > '2026-05') continue;
      if (key === '2023-02' || key === '2025-07') continue;
      out.push(key);
    }
  }
  return out;
})();

const index: MetaIndex = {
  generatedAt: '2026-08-28T00:00:00.000Z',
  window: { from: '2022-12-02', to: '2026-08-28' },
  recentFrom: '2026-06-01',
  archiveMonths: months,
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

  it('does not answer the oldest release with everything since', () => {
    const rows = filterDecks(index, { kind: 'era', set: 'OP01' });
    assert.deepEqual(ids(rows), ['a', 'b']);
  });

  it('excludes the day the next set entered play', () => {
    const rows = filterDecks(index, { kind: 'era', set: 'OP01' });
    assert.ok(!ids(rows).includes('c'), 'the boundary day leaked into the earlier era');
    assert.ok(ids(filterDecks(index, { kind: 'era', set: 'OP02' })).includes('c'));
  });

  it('is not ended by a starter deck released in the middle of it', () => {
    assert.equal(windowEnd({ kind: 'era', set: 'OP01' }, index), '2023-06-01');
    const rows = ids(filterDecks(index, { kind: 'era', set: 'OP01' }));
    assert.deepEqual(rows, ['a', 'b'], 'the ST-01 release cut the OP-01 era short');
  });

  it('is not ended by another set released the same day', () => {
    assert.equal(windowEnd({ kind: 'era', set: 'OP02' }, index), '2024-01-01');
    assert.equal(windowEnd({ kind: 'era', set: 'ST02' }, index), '2024-01-01');
    assert.deepEqual(ids(filterDecks(index, { kind: 'era', set: 'OP02' })), ['c', 'd']);
  });

  it('leaves the newest era open', () => {
    assert.equal(windowEnd({ kind: 'era', set: 'OP03' }, index), null);
    assert.deepEqual(ids(filterDecks(index, { kind: 'era', set: 'OP03' })), ['e', 'f']);
  });

  it('says which of the two it is', () => {
    assert.equal(windowLabel({ kind: 'era', set: 'OP01' }, index), 'While OP-01 was current');
    assert.equal(windowLabel({ kind: 'era', set: 'OP03' }, index), 'Since OP-03 entered play');
  });

  it('answers a release this corpus never had with nothing, not everything', () => {
    assert.equal(windowStart({ kind: 'era', set: 'NOPE' }, index), null);
    assert.equal(windowEnd({ kind: 'era', set: 'NOPE' }, index), null);
    assert.deepEqual(filterDecks(index, { kind: 'era', set: 'NOPE' }), []);
  });

  it('says so rather than naming a release it cannot show', () => {
    assert.match(
      windowLabel({ kind: 'era', set: 'NOPE' }, index),
      /never entered play in this corpus/
    );
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

describe('the archive months a window needs', () => {
  it('needs nothing when the window is inside the index payload', () => {
    assert.deepEqual(archiveMonthsFor({ kind: 'days', days: 7 }, index), []);
    assert.deepEqual(archiveMonthsFor({ kind: 'days', days: 30 }, index), []);
  });

  it('takes the whole archive for "All", and stops where the index starts', () => {
    const all = archiveMonthsFor({ kind: 'all' }, index);
    assert.deepEqual(all, months);
    assert.equal(all.at(-1), '2026-05', 'reached into what the index already holds');
  });

  it('takes an era only up to the day the next expansion arrived', () => {
    assert.deepEqual(archiveMonthsFor({ kind: 'era', set: 'OP01' }, index), [
      '2022-12',
      '2023-01',
      '2023-03',
      '2023-04',
      '2023-05',
      '2023-06',
    ]);
  });

  it('keeps the month the exclusive end falls in', () => {
    assert.equal(windowEnd({ kind: 'era', set: 'OP01' }, index), '2023-06-01');
    assert.ok(archiveMonthsFor({ kind: 'era', set: 'OP01' }, index).includes('2023-06'));
  });

  it('names only months the archive has a file for', () => {
    const asked = archiveMonthsFor({ kind: 'all' }, index);
    assert.ok(!asked.includes('2023-02'), 'asked for a month with no file');
    assert.ok(!asked.includes('2025-07'), 'asked for a month with no file');
    for (const m of asked) assert.ok(months.includes(m), `${m} is not in the archive`);
  });

  it('asks for nothing for a release this corpus never had', () => {
    assert.deepEqual(archiveMonthsFor({ kind: 'era', set: 'NOPE' }, index), []);
  });

  it('asks for nothing when the corpus has no archive', () => {
    assert.deepEqual(archiveMonthsFor({ kind: 'all' }, { ...index, archiveMonths: [] }), []);
    assert.deepEqual(archiveMonthsFor({ kind: 'all' }, { ...index, recentFrom: undefined }), []);
  });
});
