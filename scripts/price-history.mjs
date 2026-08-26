/**
 * Appending to the price history, and trimming it.
 *
 * Pure, and its own file, for one reason: the trim only runs once the archive is
 * ninety days old. A bug in it would sit unexercised for three months and then
 * rebase every card's series wrongly — a chart with the right shape and the wrong
 * dates, which is precisely the failure this repository is most careful about. Here
 * it can be run against a fabricated hundred-day store in a millisecond.
 *
 * The store is **sparse**: `prices[cardId]` is `[[dayIndex, price], …]` with one
 * entry per *change*, so reading a day means the last point at or before it. Dense
 * would be 2,651 numbers a day whether or not anything moved, committed twice a day
 * for ever. `src/lib/prices.ts` is the reader.
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
  if (!rerun) days.push(today);
  const at = days.length - 1;

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
