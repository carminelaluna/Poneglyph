/**
 * Writing the price history, and trimming it.
 *
 * The trim is the reason this file exists. It only runs once the archive is ninety
 * days old, so a mistake in it would sit unexercised for three months and then
 * rebase every card's series onto the wrong days — a chart with a plausible shape
 * and the wrong dates. Here it runs against a fabricated hundred-day store.
 *
 * `readSeries` from lib/prices.ts is the other half: what is written here has to
 * read back as the same prices on the same days, and the last case checks exactly
 * that across a trim.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { appendPrices as appendUntyped, trim as trimUntyped } from '../scripts/price-history.mjs';
import { readSeries, type Stored } from '../src/lib/prices.ts';

type Store = { days: string[]; prices: Record<string, [number, number][]> };

/*
 * The module under test is plain JavaScript, so TypeScript infers `any` from it.
 * Naming the shape here is not decoration: without it the assertions below would
 * pass against a function that had started returning something else entirely.
 */
const appendPrices = appendUntyped as (
  held: Store,
  cards: { id: string; priceLow: number | null }[],
  today: string,
  keep?: number
) => Store & { moved: number };
const trim = trimUntyped as (store: Store, keep?: number) => Store;

const empty = (): Store => ({ days: [], prices: {} });
const card = (id: string, priceLow: number | null) => ({ id, priceLow });

describe('appendPrices', () => {
  it('records the first day it ever sees', () => {
    const out = appendPrices(empty(), [card('OP01-025', 1.5)], '2026-08-20');
    assert.deepEqual(out.days, ['2026-08-20']);
    assert.deepEqual(out.prices['OP01-025'], [[0, 1.5]]);
    assert.equal(out.moved, 1);
  });

  /*
   * The whole point of the sparse store: a stable price costs one point, once —
   * and a day on which nothing moved is not recorded at all.
   *
   * That second half is not tidiness. The ingest runs three times a day and this
   * file is committed by a scheduled job, so appending a date every run would
   * rewrite it every run: a commit, a rebuild and a deploy of twenty-four thousand
   * files to publish one longer flat line.
   */
  it('records nothing at all on a day nothing moved', () => {
    const day1 = appendPrices(empty(), [card('OP01-025', 1.5)], '2026-08-20');
    const day2 = appendPrices(day1, [card('OP01-025', 1.5)], '2026-08-21');
    assert.deepEqual(day2.days, ['2026-08-20'], 'a quiet day should not extend the list');
    assert.deepEqual(day2.prices['OP01-025'], [[0, 1.5]]);
    assert.equal(day2.moved, 0);
  });

  it('leaves the file byte-identical when nothing moved', () => {
    const day1 = appendPrices(empty(), [card('OP01-025', 1.5)], '2026-08-20');
    const day2 = appendPrices(day1, [card('OP01-025', 1.5)], '2026-08-21');
    assert.equal(JSON.stringify(day2.days), JSON.stringify(day1.days));
    assert.equal(JSON.stringify(day2.prices), JSON.stringify(day1.prices));
  });

  /* Otherwise a fresh archive would have no starting point to fill forward from. */
  it('records the first day even if there is nothing to compare it against', () => {
    const out = appendPrices(empty(), [card('OP01-025', null)], '2026-08-20');
    assert.deepEqual(out.days, ['2026-08-20']);
    assert.deepEqual(out.prices, {});
  });

  it('adds a point on the day a price changed', () => {
    let store: Store = appendPrices(empty(), [card('OP01-025', 1.5)], '2026-08-20');
    store = appendPrices(store, [card('OP01-025', 1.5)], '2026-08-21');
    store = appendPrices(store, [card('OP01-025', 2.25)], '2026-08-22');
    /* The quiet middle day is absent, so the second point is index 1. */
    assert.deepEqual(store.days, ['2026-08-20', '2026-08-22']);
    assert.deepEqual(store.prices['OP01-025'], [
      [0, 1.5],
      [1, 2.25],
    ]);
  });

  /*
   * The reason the days may be uneven and it still reads correctly: a point is
   * pinned to the day it was recorded on, whichever days those turn out to be.
   */
  it('keeps a card that moves while another does not from drifting', () => {
    let store: Store = appendPrices(
      empty(),
      [card('MOVER', 1), card('STILL', 5)],
      '2026-08-20'
    );
    store = appendPrices(store, [card('MOVER', 2), card('STILL', 5)], '2026-08-25');
    assert.deepEqual(store.days, ['2026-08-20', '2026-08-25']);
    assert.deepEqual(store.prices['MOVER'], [
      [0, 1],
      [1, 2],
    ]);
    assert.deepEqual(store.prices['STILL'], [[0, 5]]);
  });

  /*
   * `refresh-prices` runs twice a day. Without this the second run of the day would
   * add a second column for the same date and the window would hold 45 days.
   */
  it('updates the same day rather than adding a second column for it', () => {
    let store: Store = appendPrices(empty(), [card('OP01-025', 1.5)], '2026-08-20');
    store = appendPrices(store, [card('OP01-025', 1.75)], '2026-08-20');
    assert.deepEqual(store.days, ['2026-08-20']);
    assert.deepEqual(store.prices['OP01-025'], [[0, 1.75]]);
  });

  it('leaves a card the source has no price for out entirely', () => {
    const out = appendPrices(empty(), [card('OP01-025', null)], '2026-08-20');
    assert.deepEqual(out.prices, {});
  });

  it('rounds to cents, so a rounding wobble is not a price move', () => {
    let store: Store = appendPrices(empty(), [card('OP01-025', 1.499)], '2026-08-20');
    store = appendPrices(store, [card('OP01-025', 1.5013)], '2026-08-21');
    assert.deepEqual(store.prices['OP01-025'], [[0, 1.5]]);
  });

  it('does not write through the store it was given', () => {
    const held = empty();
    appendPrices(held, [card('OP01-025', 1.5)], '2026-08-20');
    assert.deepEqual(held, { days: [], prices: {} });
  });
});

describe('trim', () => {
  /*
   * A hundred consecutive recorded days. MOVER changes every day, which is what
   * puts every date into the list; STILL is set once at the start and never again,
   * which is the case the trim has to carry forward.
   */
  const hundredDays = () => {
    let store: Store = empty();
    for (let i = 0; i < 100; i++) {
      const day = new Date(Date.UTC(2026, 4, 1) + i * 86_400_000).toISOString().slice(0, 10);
      store = appendPrices(store, [card('MOVER', 1 + i), card('STILL', 5)], day, 1000);
    }
    return store;
  };

  it('keeps the last N days and rebases the indices', () => {
    const store = trim(hundredDays(), 30);
    assert.equal(store.days.length, 30);
    /* 1 May plus seventy days: the first of the thirty that are kept. */
    assert.equal(store.days[0], '2026-07-10');
    for (const series of Object.values(store.prices)) {
      for (const [day] of series) {
        assert.ok(day >= 0 && day < 30, `index ${day} is outside the kept window`);
      }
    }
  });

  /*
   * The carry. A card whose last change was before the cut is still at that price
   * on the first day inside it; dropping the point would start its line on whatever
   * day it next happened to move, which is a different chart.
   */
  it('carries a price forward from before the cut', () => {
    const store = trim(hundredDays(), 30);
    assert.deepEqual(store.prices['STILL'], [[0, 5]]);
  });

  it('leaves a store shorter than the window alone', () => {
    const store = hundredDays();
    assert.deepEqual(trim(store, 200), { days: store.days, prices: store.prices });
  });

  it('reads back as the same prices on the same days', () => {
    const before = hundredDays();
    const after = trim(before, 30);

    const fullSeries = readSeries(before as unknown as Stored, 'MOVER');
    const trimmedSeries = readSeries(after as unknown as Stored, 'MOVER');

    assert.equal(trimmedSeries.length, 30);
    const tail = fullSeries.slice(-30);
    assert.deepEqual(trimmedSeries, tail, 'the trimmed series is not the tail of the full one');
  });
});
