import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { movers, type Stored } from '../src/lib/prices.ts';

const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'];

const store = (prices: Record<string, [number, number][]>): Stored =>
  ({ generatedAt: '', days, prices }) as Stored;

const only = (source: Stored, span: number, id: string) =>
  movers(source, span).find((m) => m.id === id) ?? null;

describe('reading a sparse series', () => {
  it('carries the last price forward to the window start', () => {
    const m = only(store({ A: [[0, 2], [4, 3]] }), 4, 'A');
    assert.equal(m?.from, 2);
    assert.equal(m?.to, 3);
    assert.equal(m?.delta, 1);
    assert.equal(m?.percent, 50);
  });

  it('reads the latest price, not the one on the last recorded change', () => {
    const m = only(store({ A: [[0, 4], [1, 5]] }), 4, 'A');
    assert.equal(m?.to, 5);
  });

  it('measures from inside the window, not from the start of the series', () => {
    const m = only(store({ A: [[0, 1], [1, 2], [4, 3]] }), 3, 'A');
    assert.equal(m?.from, 2, 'took the price at the window edge');
    assert.equal(m?.to, 3);
  });
});

describe('what is left out', () => {
  it('skips a card first seen inside the window', () => {
    assert.equal(only(store({ A: [[3, 5], [4, 9]] }), 2, 'A'), null);
  });

  it('keeps that card out of a longer window and in a shorter one', () => {
    assert.equal(only(store({ A: [[3, 5], [4, 9]] }), 4, 'A'), null, 'window opens at day 0');
    const m = only(store({ A: [[3, 5], [4, 9]] }), 1, 'A');
    assert.equal(m?.from, 5, 'window opens at day 3, where the card exists');
    assert.equal(m?.to, 9);
  });

  it('skips a card that did not move', () => {
    assert.equal(only(store({ A: [[0, 3]] }), 4, 'A'), null);
    assert.equal(only(store({ A: [[0, 3], [2, 4], [4, 3]] }), 4, 'A'), null, 'ended where it began');
  });

  it('skips a price of zero rather than dividing by it', () => {
    assert.equal(only(store({ A: [[0, 0], [4, 2]] }), 4, 'A'), null);
  });

  it('is empty when there is not enough history for a move', () => {
    assert.deepEqual(movers({ generatedAt: '', days: ['2026-09-01'], prices: { A: [[0, 1]] } } as Stored, 7), []);
    assert.deepEqual(movers({ generatedAt: '', days: [], prices: {} } as Stored, 7), []);
  });
});

describe('the window', () => {
  it('counts recorded days, not calendar days', () => {
    const source = store({ A: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]] });
    assert.equal(only(source, 2, 'A')?.from, 3);
    assert.equal(only(source, 4, 'A')?.from, 1);
  });

  it('gives the whole span rather than failing when asked for more than exists', () => {
    const m = only(store({ A: [[0, 1], [4, 5]] }), Number.MAX_SAFE_INTEGER, 'A');
    assert.equal(m?.from, 1);
    assert.equal(m?.to, 5);
  });
});

describe('the two ways of reading a move', () => {
  it('separates a large ratio from a large amount', () => {
    const source = store({ CHEAP: [[0, 0.25], [4, 1]], DEAR: [[0, 100], [4, 110]] });
    const found = Object.fromEntries(movers(source, 4).map((m) => [m.id, m]));
    assert.equal(found.CHEAP.percent, 300);
    assert.equal(found.CHEAP.delta, 0.75);
    assert.equal(found.DEAR.percent, 10);
    assert.equal(found.DEAR.delta, 10);
  });

  it('reports a fall as negative in both', () => {
    const m = only(store({ A: [[0, 10], [4, 6]] }), 4, 'A');
    assert.equal(m?.delta, -4);
    assert.equal(m?.percent, -40);
  });

  it('rounds money to the cent and the ratio to a tenth', () => {
    const m = only(store({ A: [[0, 3], [4, 3.333]] }), 4, 'A');
    assert.equal(m?.delta, 0.33);
    assert.equal(m?.percent, 11.1);
  });
});
