/**
 * Appending to the price history, and trimming it.
 *
 * Pure, and its own file, for one reason: the trim only runs once the archive is
 * ninety days old. A bug in it would sit unexercised for three months and then
 * rebase every card's series wrongly — a chart with the right shape and the wrong
 * dates, which is precisely the failure this repository is most careful about. Here
 * it can be run against a fabricated hundred-day store in a millisecond.
 *
 * The store is **sparse in both directions**. `prices[cardId]` is `[[dayIndex,
 * price], …]` with one entry per *change*, so reading a day means the last point at
 * or before it; and `days` holds the days something changed *on*, not the days the
 * ingest happened to run. Dense would be 2,651 numbers three times a day whether or
 * not anything moved, committed to a repository that redeploys on every commit.
 *
 * The consequence for the reader is that the gaps between days are uneven, which is
 * why `sparkline` in src/lib/prices.ts places points by date rather than by index.
 */

/** How much history is kept. Ninety days is what the card page draws. */
export const PRICE_DAYS = 90;

/**
 * @param {{days: string[], prices: Record<string, [number, number][]>}} held
 * @param {{id: string, priceLow: number|null}[]} cards
 * @param {string} today  `YYYY-MM-DD`
 */
export function appendPrices(held, cards, today, keep = PRICE_DAYS) {
  const days = Array.isArray(held?.days) ? held.days.slice() : [];
  const prices = {};
  for (const [id, series] of Object.entries(held?.prices ?? {})) {
    prices[id] = series.map((point) => [point[0], point[1]]);
  }

  /* Two runs in one day update that day rather than adding a second column. */
  const rerun = days.at(-1) === today;
  const at = rerun ? days.length - 1 : days.length;

  let moved = 0;
  for (const card of cards) {
    if (card.priceLow === null || card.priceLow === undefined) continue;
    const price = Math.round(card.priceLow * 100) / 100;
    const series = (prices[card.id] ??= []);

    /* A re-run replaces the point it wrote earlier today rather than stacking one. */
    if (rerun && series.at(-1)?.[0] === at) series.pop();

    if (series.at(-1)?.[1] === price) continue;
    series.push([at, price]);
    moved++;
  }

  /*
   * A day is recorded because something moved on it, not because the ingest ran.
   *
   * The ingest runs three times a day and this file is committed by a scheduled
   * job, so appending a date on a day when no price changed would rewrite it — and
   * a rewritten file is a commit, a rebuild and a deploy of twenty-four thousand
   * files to publish one longer flat line. That is the exact failure this
   * repository already removed once; see scripts/substantive-change.mjs.
   *
   * The first day is kept whatever happens, so a fresh archive has a starting
   * point rather than an empty list.
   */
  if (!rerun && (moved > 0 || days.length === 0)) days.push(today);

  return { ...trim({ days, prices }, keep), moved };
}

/**
 * Drop days off the front, rebasing what is left.
 *
 * The subtlety is the carry: a card whose last change was before the cut is still
 * at that price on the first day inside it. Dropping the point outright would start
 * its line on whatever day it next happened to move, which is a different chart.
 */
export function trim(store, keep = PRICE_DAYS) {
  const { days, prices } = store;
  if (days.length <= keep) return { days, prices };

  const cut = days.length - keep;
  const kept = days.slice(cut);
  const rebased = {};

  for (const [id, series] of Object.entries(prices)) {
    const carried = [];
    let before = null;
    for (const [day, price] of series) {
      if (day < cut) before = price;
      else carried.push([day - cut, price]);
    }
    if (before !== null && carried[0]?.[0] !== 0) carried.unshift([0, before]);
    if (carried.length) rebased[id] = carried;
  }

  return { days: kept, prices: rebased };
}
