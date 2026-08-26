/**
 * Reading the price history back.
 *
 * The file is stored sparsely — a point only on a day the price moved — so every
 * question about it is really a question about the fill-forward. Getting that wrong
 * does not throw; it draws a plausible line with the wrong shape, which is the kind
 * of failure this repository cares most about.
 *
 * The store is built here rather than read from `data/`, so these do not depend on
 * how many days the ingest happens to have recorded.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { priceMove, readSeries, sparkline, type Stored } from '../src/lib/prices.ts';

const store: Stored = {
  generatedAt: '2026-08-26T00:00:00.000Z',
  days: ['2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24'],
  prices: {
    /* Moved on day 0 and again on day 3. */
    'OP01-025': [
      [0, 1.5],
      [3, 2.25],
    ],
    /* Recorded from day 2 only — the card had no price before that. */
    'OP02-001': [[2, 10]],
    /* Never moved. */
    'OP03-001': [[0, 0.05]],
    'OP04-001': [],
  },
};

describe('readSeries', () => {
  it('fills forward across the days a price did not move', () => {
    assert.deepEqual(
      readSeries(store, 'OP01-025').map((p) => p.price),
      [1.5, 1.5, 1.5, 2.25, 2.25]
    );
  });

  it('starts where the record starts, rather than at zero', () => {
    const series = readSeries(store, 'OP02-001');
    assert.equal(series.length, 3);
    assert.equal(series[0].day, '2026-08-22');
    assert.deepEqual(
      series.map((p) => p.price),
      [10, 10, 10]
    );
  });

  it('gives nothing back for a card with no history', () => {
    assert.deepEqual(readSeries(store, 'OP04-001'), []);
    assert.deepEqual(readSeries(store, 'NOPE-999'), []);
  });

  it('pairs every price with its own day', () => {
    const series = readSeries(store, 'OP01-025');
    assert.deepEqual(
      series.map((p) => p.day),
      store.days
    );
  });
});

describe('priceMove', () => {
  it('reports the change across the whole window', () => {
    const move = priceMove(readSeries(store, 'OP01-025'))!;
    assert.equal(move.from, 1.5);
    assert.equal(move.to, 2.25);
    assert.equal(move.delta, 0.75);
    assert.equal(move.percent, 50);
    assert.equal(move.low, 1.5);
    assert.equal(move.high, 2.25);
  });

  it('reports no movement as zero rather than as nothing', () => {
    const move = priceMove(readSeries(store, 'OP03-001'))!;
    assert.equal(move.delta, 0);
    assert.equal(move.percent, 0);
  });

  it('has nothing to say about a single day', () => {
    assert.equal(priceMove([{ day: '2026-08-20', price: 1 }]), null);
    assert.equal(priceMove([]), null);
  });

  /* A ratio against zero is infinity, and printing that as a percentage is worse
     than printing nothing. */
  it('refuses a percentage when the earlier price was zero', () => {
    const move = priceMove([
      { day: '2026-08-20', price: 0 },
      { day: '2026-08-21', price: 3 },
    ])!;
    assert.equal(move.delta, 3);
    assert.equal(move.percent, null);
  });
});

describe('sparkline', () => {
  it('spans the box and draws one point per day', () => {
    const path = sparkline(readSeries(store, 'OP01-025'), 120, 32);
    const points = path.split(' ');
    assert.equal(points.length, 5);
    assert.match(points[0], /^M0\.0,/);
    assert.match(points[4], /^L120\.0,/);
  });

  /* Down the middle, not along the floor: a card that has not moved has not
     fallen to nothing. */
  it('draws a flat series through the middle', () => {
    const path = sparkline(readSeries(store, 'OP03-001'), 120, 32);
    for (const point of path.split(' ')) assert.match(point, /,16\.0$/);
  });

  it('draws nothing from a single point', () => {
    assert.equal(sparkline([{ day: '2026-08-20', price: 1 }]), '');
  });
});
