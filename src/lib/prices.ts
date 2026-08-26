/**
 * What a card used to cost.
 *
 * `data/price-history.json` is written by the card ingest. This file reads it back
 * and is **free of imports**, like `lib/meta.ts` and `lib/deck-rules.ts`: the caller
 * passes the store in. That is what lets a test check the fill-forward against a
 * five-day fixture rather than against however many days the ingest happens to have
 * recorded by then, and it keeps a JSON import out of code that only wants the
 * arithmetic.
 *
 * The card page reads the file at build time, so each card carries its own line as
 * inline SVG and the browser fetches nothing — one card's ninety days is a few
 * hundred bytes, against a payload everybody would download to look at one card.
 *
 * The store is **sparse**: a point exists only for a day the price moved, so reading
 * a day means taking the last point at or before it. See the note by `recordPrices`
 * in scripts/ingest.mjs for why it is kept that way.
 *
 * Nothing here invents a past. The archive began recording on the day this shipped,
 * and a card with one point says so rather than drawing a flat line that would read
 * as a price holding steady.
 */

/** `[dayIndex, price]`, ordered, one entry per change. */
export type PricePoints = [number, number][];

export type Stored = {
  generatedAt: string;
  days: string[];
  prices: Record<string, PricePoints>;
};

export type PricePoint = { day: string; price: number };

/** How many days a chart needs before it is worth drawing rather than describing. */
export const MIN_POINTS = 3;

/**
 * One card's series, filled forward across the days it did not move.
 *
 * Filled rather than left sparse because a chart drawn from change-points alone
 * slopes between them, which says the price drifted when what actually happened is
 * that it sat still and then jumped.
 */
export function readSeries(source: Stored, cardId: string): PricePoint[] {
  const points = source.prices?.[cardId];
  const days = source.days ?? [];
  if (!points || points.length === 0) return [];

  const series: PricePoint[] = [];
  let next = 0;
  let current: number | null = null;

  for (let day = 0; day < days.length; day++) {
    while (next < points.length && points[next][0] <= day) current = points[next++][1];
    /* Days before the first recorded point are absent, not zero. */
    if (current !== null) series.push({ day: days[day], price: current });
  }
  return series;
}

export type PriceMove = {
  from: number;
  to: number;
  delta: number;
  /** Percent, or null when the earlier price was zero and a ratio means nothing. */
  percent: number | null;
  low: number;
  high: number;
  days: number;
};

export function priceMove(series: PricePoint[]): PriceMove | null {
  if (series.length < 2) return null;
  const from = series[0].price;
  const to = series[series.length - 1].price;
  const values = series.map((p) => p.price);
  return {
    from,
    to,
    delta: Math.round((to - from) * 100) / 100,
    percent: from > 0 ? Math.round(((to - from) / from) * 1000) / 10 : null,
    low: Math.min(...values),
    high: Math.max(...values),
    days: series.length,
  };
}

/**
 * The series as an SVG path, in a 0..width by 0..height box.
 *
 * A flat series is drawn down the middle rather than along the bottom: a card that
 * has not moved has not fallen to nothing.
 */
export function sparkline(series: PricePoint[], width = 120, height = 32): string {
  if (series.length < 2) return '';
  const values = series.map((p) => p.price);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;

  return series
    .map((point, i) => {
      const x = (i / (series.length - 1)) * width;
      const y = span === 0 ? height / 2 : height - ((point.price - low) / span) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
