export type PricePoints = [number, number][];

export type Stored = {
  generatedAt: string;
  days: string[];
  prices: Record<string, PricePoints>;
};

export type PricePoint = { day: string; price: number };

export const MIN_POINTS = 3;

export function readSeries(source: Stored, cardId: string): PricePoint[] {
  const points = source.prices?.[cardId];
  const days = source.days ?? [];
  if (!points || points.length === 0) return [];

  const series: PricePoint[] = [];
  let next = 0;
  let current: number | null = null;

  for (let day = 0; day < days.length; day++) {
    while (next < points.length && points[next][0] <= day) current = points[next++][1];
    if (current !== null) series.push({ day: days[day], price: current });
  }
  return series;
}

export type PriceMove = {
  from: number;
  to: number;
  delta: number;
  percent: number | null;
  low: number;
  high: number;
  points: number;
  firstDay: string;
  lastDay: string;
  span: number;
};

export function priceMove(series: PricePoint[]): PriceMove | null {
  if (series.length < 2) return null;
  const from = series[0].price;
  const to = series[series.length - 1].price;
  const values = series.map((p) => p.price);
  const firstDay = series[0].day;
  const lastDay = series[series.length - 1].day;

  return {
    from,
    to,
    delta: Math.round((to - from) * 100) / 100,
    percent: from > 0 ? Math.round(((to - from) / from) * 1000) / 10 : null,
    low: Math.min(...values),
    high: Math.max(...values),
    points: series.length,
    firstDay,
    lastDay,
    span:
      Math.round(
        (Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${firstDay}T00:00:00Z`)) / 86_400_000
      ) + 1,
  };
}

export function sparkline(series: PricePoint[], width = 120, height = 32): string {
  if (series.length < 2) return '';
  const values = series.map((p) => p.price);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;

  const first = Date.parse(`${series[0].day}T00:00:00Z`);
  const last = Date.parse(`${series[series.length - 1].day}T00:00:00Z`);
  const days = last - first || 1;

  return series
    .map((point, i) => {
      const x = ((Date.parse(`${point.day}T00:00:00Z`) - first) / days) * width;
      const y = span === 0 ? height / 2 : height - ((point.price - low) / span) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function listPrice(
  cards: { count: number; price: number | null }[],
  leader?: { $?: number | null } | null
) {
  let total = leader?.$ ?? 0;
  let unpriced = leader && (leader.$ ?? null) === null ? 1 : 0;
  for (const card of cards) {
    if (card.price === null) unpriced += card.count;
    else total += card.price * card.count;
  }
  return { total: Math.round(total * 100) / 100, unpriced };
}

export type Mover = {
  id: string;
  from: number;
  to: number;
  delta: number;
  percent: number;
};

export function movers(source: Stored, days: number): Mover[] {
  const all = source.days ?? [];
  if (all.length < 2) return [];

  const last = all.length - 1;
  const from = Math.max(0, last - days);
  const out: Mover[] = [];

  for (const [id, points] of Object.entries(source.prices ?? {})) {
    if (!points?.length) continue;
    if (points[0][0] > from) continue;

    let before: number | null = null;
    let after: number | null = null;
    for (const [day, price] of points) {
      if (day <= from) before = price;
      if (day <= last) after = price;
    }
    if (before === null || after === null || before === after || before <= 0) continue;

    out.push({
      id,
      from: before,
      to: after,
      delta: Math.round((after - before) * 100) / 100,
      percent: Math.round(((after - before) / before) * 1000) / 10,
    });
  }

  return out;
}
