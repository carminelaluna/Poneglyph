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
  /** Recorded points — days something moved, not days elapsed. */
  points: number;
  firstDay: string;
  lastDay: string;
  /** Calendar days the line actually spans, which is the honest x-axis. */
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

  /*
   * Placed by date, not by position. The store records a day because a price moved
   * on it, so the gaps between them are uneven — spacing the points evenly would
   * draw a fortnight of stillness and an overnight jump as the same width, which is
   * the one thing a price chart is read to tell apart.
   */
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

/**
 * What a list would cost to put together, at the lowest listed price.
 *
 * Returns the count it could not price as well as the total, because those two
 * numbers have to be read together: a total that quietly skipped a third of the
 * deck would look like a bargain rather than like missing data.
 *
 * Here rather than in `lib/shards.ts`, where it used to live, for the reason this
 * whole file exists — that one imports, so nothing in it can be run by a test.
 */
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
  /* Rounded once, at the end: adding cents and rounding per card drifts. */
  return { total: Math.round(total * 100) / 100, unpriced };
}

/** One card's movement across a window, with both ways of reading it. */
export type Mover = {
  id: string;
  from: number;
  to: number;
  /** Cash. What you gained or lost per copy. */
  delta: number;
  /** Ratio. What the market did to it, which is a different question. */
  percent: number;
};

/**
 * Every card whose price changed across the last `days` **recorded** days.
 *
 * Recorded, not calendar: `days` in the store holds the days something moved on,
 * not the days the ingest ran, so counting back through the array is counting back
 * through real observations. Asking for more than exist gives the whole span rather
 * than an error, because the history is ninety days at its cap and starts empty.
 *
 * A card whose first recorded point falls *inside* the window is skipped. There is
 * no earlier price to compare it to, and treating the first sighting as the opening
 * price would report a card the ingest had just met as flat.
 *
 * No floor is applied here. That is a decision about the percentage view — below
 * about a dollar a one-cent tick is a double-digit percentage, so a ranking by
 * percent with no floor measures the source's rounding rather than the market —
 * and it belongs where it can be seen and stated, not buried in this.
 */
export function movers(source: Stored, days: number): Mover[] {
  const all = source.days ?? [];
  if (all.length < 2) return [];

  const last = all.length - 1;
  const from = Math.max(0, last - days);
  const out: Mover[] = [];

  for (const [id, points] of Object.entries(source.prices ?? {})) {
    if (!points?.length) continue;
    /*
     * First seen after the window opened: nothing to compare against.
     *
     * Redundant, and deliberately kept. If no point sits at or before `from` then
     * `before` stays null and the check below drops the card anyway — proved by
     * mutation, deleting this line changes no test and no answer. It is here
     * because it states the rule at the top of the loop, where a reader meets it,
     * rather than leaving it to be inferred from a null three lines down.
     */
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
