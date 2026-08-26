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
import { listPrice, priceMove, readSeries, sparkline, type Stored } from '../src/lib/prices.ts';

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

  /*
   * Points and span are different numbers and the page prints both. The archive
   * records a day because a price moved on it, so three points can cover sixty
   * days — and calling that "3 days" would read as a chart of last week.
   */
  it('separates how many points it has from how long they cover', () => {
    const sparse = priceMove([
      { day: '2026-06-01', price: 10 },
      { day: '2026-07-31', price: 12 },
    ])!;
    assert.equal(sparse.points, 2);
    assert.equal(sparse.span, 61);
    assert.equal(sparse.firstDay, '2026-06-01');
    assert.equal(sparse.lastDay, '2026-07-31');
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

  /*
   * Placed by date, not by position. A fortnight of stillness and an overnight
   * jump drawn the same width is the one thing a price chart is read to tell
   * apart — and the store records days on which something moved, so the gaps
   * between them are uneven by construction.
   */
  it('spaces the points by how far apart the days are', () => {
    const path = sparkline(
      [
        { day: '2026-06-01', price: 1 },
        { day: '2026-06-02', price: 2 },
        { day: '2026-07-31', price: 3 },
      ],
      120,
      32
    );
    const xs = path.split(' ').map((point) => Number(point.slice(1).split(',')[0]));
    assert.equal(xs[0], 0);
    assert.equal(xs[2], 120);
    /* One day of sixty, so the middle point sits near the left edge. */
    assert.ok(xs[1] > 0 && xs[1] < 4, `middle point at ${xs[1]}, expected near the start`);
  });
});

describe('listPrice', () => {
  const cards = [
    { count: 4, price: 1.5 },
    { count: 2, price: 0.25 },
  ];

  it('sums every copy', () => {
    assert.deepEqual(listPrice(cards), { total: 6.5, unpriced: 0 });
  });

  it('includes the Leader, which you also have to own', () => {
    assert.deepEqual(listPrice(cards, { $: 10 }), { total: 16.5, unpriced: 0 });
  });

  /* The number that must never be quietly folded in as zero. */
  it('counts the copies it could not price', () => {
    assert.deepEqual(listPrice([{ count: 3, price: null }, { count: 1, price: 2 }]), {
      total: 2,
      unpriced: 3,
    });
  });

  it('counts an unpriced Leader as one of them', () => {
    assert.deepEqual(listPrice([], { $: null }), { total: 0, unpriced: 1 });
    assert.deepEqual(listPrice([], {}), { total: 0, unpriced: 1 });
  });

  it('has nothing to say about an empty list', () => {
    assert.deepEqual(listPrice([]), { total: 0, unpriced: 0 });
  });

  it('rounds the total, not the parts', () => {
    assert.deepEqual(listPrice([{ count: 3, price: 0.335 }]), { total: 1.01, unpriced: 0 });
  });
});
