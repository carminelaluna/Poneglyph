export type StatCard = {
  o: number | null;
  u: number | null;
  $: number | null;
};

export type Counted<T> = { card: { id: string }; count: number };

export const TOP_COST = 10;

export type CurveBar = { cost: number; copies: number };

export type DeckStats = {
  curve: CurveBar[];
  peak: number;
  averageCost: number;
  counters: number;
  counterPower: number;
  price: number;
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
  while (bars.length > 1 && bars[bars.length - 1].copies === 0) bars.pop();

  return {
    curve: bars,
    peak: Math.max(1, ...bars.map((b) => b.copies)),
    averageCost: costed ? costTotal / costed : 0,
    counters,
    counterPower,
    price: Math.round(price * 100) / 100,
    unpriced,
  };
}

export const curveLabel = (stats: DeckStats) =>
  'Cost curve: ' +
  stats.curve
    .filter((bar) => bar.copies > 0)
    .map(
      (bar) =>
        `${bar.copies} at cost ${bar.cost === TOP_COST ? `${TOP_COST} or more` : bar.cost}`
    )
    .join(', ');
