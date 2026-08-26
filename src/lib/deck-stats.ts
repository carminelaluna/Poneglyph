/**
 * What fifty cards add up to.
 *
 * Free of imports, like `lib/deck-rules.ts` next to it: it takes rows out of the
 * card index and gives numbers back, so the builder, a test and anything else all
 * get the same answer. Every figure here is arithmetic on a payload the page has
 * already downloaded, so none of it costs a request.
 *
 * Two are worth explaining.
 *
 * **Counter** is the total counter power, not the count of cards carrying one. A
 * deck holding 34 counters at 1000 plays differently from one holding 34 at 2000,
 * and the number of cards alone does not say which it is — so both are reported.
 *
 * **Price** is the *lowest listed*, summed over every copy including the Leader,
 * and it counts what it could not price rather than treating a missing figure as
 * zero. About one card in twenty has no price; folding those in as free would read
 * as a cheaper deck rather than as an incomplete total.
 */

/** One row of the card index, as much of it as this file needs. */
export type StatCard = {
  /** Cost. `null` for a Leader, and for anything the archive has no cost for. */
  o: number | null;
  /** Counter power, `null` when the card has none. */
  u: number | null;
  /** Lowest listed price, `null` when the price source has none. */
  $: number | null;
};

export type Counted<T> = { card: { id: string }; count: number };

/** Everything from 10 up shares the last column; the curve is flat past it. */
export const TOP_COST = 10;

export type CurveBar = { cost: number; copies: number };

export type DeckStats = {
  curve: CurveBar[];
  /** The tallest column, so a bar can be drawn as a fraction of it. Never 0. */
  peak: number;
  averageCost: number;
  /** Cards carrying a counter, and the total counter power of the deck. */
  counters: number;
  counterPower: number;
  price: number;
  /** Copies the price source has no figure for — named rather than folded in. */
  unpriced: number;
};

export function deckStats(
  deck: { card: { id: string }; count: number }[],
  byId: Map<string, StatCard>,
  leader?: StatCard
): DeckStats {
  const curve = new Map<number, number>();
  let counters = 0;
  let counterPower = 0;
  let price = leader?.$ ?? 0;
  let unpriced = leader && leader.$ === null ? 1 : 0;
  let costTotal = 0;
  let costed = 0;

  for (const { card, count } of deck) {
    const row = byId.get(card.id);
    if (!row) continue;

    if (row.o !== null) {
      const bucket = Math.min(row.o, TOP_COST);
      curve.set(bucket, (curve.get(bucket) ?? 0) + count);
      costTotal += row.o * count;
      costed += count;
    }
    if (row.u) {
      counters += count;
      counterPower += row.u * count;
    }
    if (row.$ === null) unpriced += count;
    else price += row.$ * count;
  }

  const bars: CurveBar[] = [];
  for (let cost = 0; cost <= TOP_COST; cost++) bars.push({ cost, copies: curve.get(cost) ?? 0 });
  /* Trim the empty tail, so a deck topping out at 7 draws no empty columns. */
  while (bars.length > 1 && bars[bars.length - 1].copies === 0) bars.pop();

  return {
    curve: bars,
    peak: Math.max(1, ...bars.map((b) => b.copies)),
    averageCost: costed ? costTotal / costed : 0,
    counters,
    counterPower,
    /* Rounded once, at the end: adding cents and rounding per card drifts. */
    price: Math.round(price * 100) / 100,
    unpriced,
  };
}

/**
 * The curve as a sentence, for anyone not reading it as a picture.
 *
 * A row of bars with no text alternative is invisible to a screen reader and says
 * nothing at all to it; the same numbers read aloud are perfectly usable.
 */
export const curveLabel = (stats: DeckStats) =>
  'Cost curve: ' +
  stats.curve
    .filter((bar) => bar.copies > 0)
    .map(
      (bar) =>
        `${bar.copies} at cost ${bar.cost === TOP_COST ? `${TOP_COST} or more` : bar.cost}`
    )
    .join(', ');
