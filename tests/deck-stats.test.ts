/**
 * What the builder says a deck adds up to.
 *
 * Arithmetic that is read as fact and checked by nobody: a curve with a column in
 * the wrong place, an average over the cards that happen to have a cost, a price
 * that quietly treats the unpriced fifth of a deck as free. None of it throws, and
 * all of it looks like a number.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TOP_COST, curveLabel, deckStats, type StatCard } from '../src/lib/deck-stats.ts';

const row = (over: Partial<StatCard> = {}): StatCard => ({ o: 3, u: null, $: null, ...over });

/** A deck as the builder holds it, plus the index rows it looks the cards up in. */
function build(entries: { id: string; count: number; card: StatCard }[]) {
  return {
    deck: entries.map((e) => ({ card: { id: e.id }, count: e.count })),
    byId: new Map(entries.map((e) => [e.id, e.card])),
  };
}

describe('the cost curve', () => {
  it('counts copies, not cards', () => {
    const { deck, byId } = build([
      { id: 'a', count: 4, card: row({ o: 2 }) },
      { id: 'b', count: 3, card: row({ o: 2 }) },
    ]);
    const stats = deckStats(deck, byId);
    assert.equal(stats.curve[2].copies, 7);
    assert.equal(stats.peak, 7);
  });

  it('puts everything from ten up in the last column', () => {
    const { deck, byId } = build([
      { id: 'a', count: 1, card: row({ o: 10 }) },
      { id: 'b', count: 2, card: row({ o: 12 }) },
    ]);
    const stats = deckStats(deck, byId);
    assert.equal(stats.curve[TOP_COST].copies, 3);
  });

  it('trims the empty tail but keeps the gaps inside', () => {
    const { deck, byId } = build([
      { id: 'a', count: 2, card: row({ o: 1 }) },
      { id: 'b', count: 2, card: row({ o: 4 }) },
    ]);
    const stats = deckStats(deck, byId);
    assert.equal(stats.curve.length, 5, 'should run 0..4');
    assert.deepEqual(
      stats.curve.map((b) => b.copies),
      [0, 2, 0, 0, 2]
    );
  });

  it('always has a peak of at least one, so a bar can divide by it', () => {
    const { deck, byId } = build([]);
    assert.equal(deckStats(deck, byId).peak, 1);
  });

  it('leaves out a card the index does not have', () => {
    const deck = [{ card: { id: 'ghost' }, count: 4 }];
    const stats = deckStats(deck, new Map());
    assert.equal(stats.peak, 1);
    assert.equal(stats.averageCost, 0);
  });

  it('describes itself for a reader who cannot see it', () => {
    const { deck, byId } = build([
      { id: 'a', count: 2, card: row({ o: 1 }) },
      { id: 'b', count: 3, card: row({ o: 10 }) },
    ]);
    const label = curveLabel(deckStats(deck, byId));
    assert.match(label, /2 at cost 1/);
    assert.match(label, /3 at cost 10 or more/);
  });
});

describe('average cost', () => {
  it('is per copy, not per entry', () => {
    const { deck, byId } = build([
      { id: 'a', count: 4, card: row({ o: 1 }) },
      { id: 'b', count: 1, card: row({ o: 6 }) },
    ]);
    assert.equal(deckStats(deck, byId).averageCost, 2);
  });

  /* A Leader has no cost, and neither does anything the archive is missing one
     for. Counting those as zero would drag every average down. */
  it('ignores cards with no cost rather than counting them as zero', () => {
    const { deck, byId } = build([
      { id: 'a', count: 2, card: row({ o: 4 }) },
      { id: 'b', count: 2, card: row({ o: null }) },
    ]);
    assert.equal(deckStats(deck, byId).averageCost, 4);
  });
});

describe('counters', () => {
  it('reports the cards and the power, which are different questions', () => {
    const { deck, byId } = build([
      { id: 'a', count: 4, card: row({ u: 1000 }) },
      { id: 'b', count: 4, card: row({ u: 2000 }) },
      { id: 'c', count: 2, card: row({ u: null }) },
    ]);
    const stats = deckStats(deck, byId);
    assert.equal(stats.counters, 8);
    assert.equal(stats.counterPower, 12000);
  });
});

describe('price', () => {
  it('sums every copy and includes the Leader', () => {
    const { deck, byId } = build([
      { id: 'a', count: 4, card: row({ $: 1.5 }) },
      { id: 'b', count: 2, card: row({ $: 0.25 }) },
    ]);
    const stats = deckStats(deck, byId, row({ $: 10 }));
    assert.equal(stats.price, 16.5);
    assert.equal(stats.unpriced, 0);
  });

  /*
   * The one that matters. About one card in twenty has no price; adding those as
   * zero would report a cheaper deck rather than an incomplete total, and the
   * reader would have no way to tell which they were looking at.
   */
  it('counts what it could not price instead of calling it free', () => {
    const { deck, byId } = build([
      { id: 'a', count: 4, card: row({ $: 2 }) },
      { id: 'b', count: 3, card: row({ $: null }) },
    ]);
    const stats = deckStats(deck, byId);
    assert.equal(stats.price, 8);
    assert.equal(stats.unpriced, 3);
  });

  it('counts an unpriced Leader as one of them', () => {
    const { deck, byId } = build([{ id: 'a', count: 1, card: row({ $: 1 }) }]);
    assert.equal(deckStats(deck, byId, row({ $: null })).unpriced, 1);
  });

  /* Rounded once at the end: rounding each card first drifts by cents. */
  it('rounds the total, not the parts', () => {
    const { deck, byId } = build([{ id: 'a', count: 3, card: row({ $: 0.335 }) }]);
    assert.equal(deckStats(deck, byId).price, 1.01);
  });
});
