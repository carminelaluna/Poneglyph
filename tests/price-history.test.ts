import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { appendPrices as appendUntyped, trim as trimUntyped } from '../scripts/price-history.mjs';
import { readSeries, type Stored } from '../src/lib/prices.ts';

type Store = { days: string[]; prices: Record<string, [number, number][]> };

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

  it('records the first day even if there is nothing to compare it against', () => {
    const out = appendPrices(empty(), [card('OP01-025', null)], '2026-08-20');
    assert.deepEqual(out.days, ['2026-08-20']);
    assert.deepEqual(out.prices, {});
  });

  it('adds a point on the day a price changed', () => {
    let store: Store = appendPrices(empty(), [card('OP01-025', 1.5)], '2026-08-20');
    store = appendPrices(store, [card('OP01-025', 1.5)], '2026-08-21');
    store = appendPrices(store, [card('OP01-025', 2.25)], '2026-08-22');
    assert.deepEqual(store.days, ['2026-08-20', '2026-08-22']);
    assert.deepEqual(store.prices['OP01-025'], [
      [0, 1.5],
      [1, 2.25],
    ]);
  });

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
    assert.equal(store.days[0], '2026-07-10');
    for (const series of Object.values(store.prices)) {
      for (const [day] of series) {
        assert.ok(day >= 0 && day < 30, `index ${day} is outside the kept window`);
      }
    }
  });

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
