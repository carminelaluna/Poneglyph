export const PRICE_DAYS = 90;

export function appendPrices(held, cards, today, keep = PRICE_DAYS) {
  const days = Array.isArray(held?.days) ? held.days.slice() : [];
  const prices = {};
  for (const [id, series] of Object.entries(held?.prices ?? {})) {
    prices[id] = series.map((point) => [point[0], point[1]]);
  }

  const rerun = days.at(-1) === today;
  const at = rerun ? days.length - 1 : days.length;

  let moved = 0;
  for (const card of cards) {
    if (card.priceLow === null || card.priceLow === undefined) continue;
    const price = Math.round(card.priceLow * 100) / 100;
    const series = (prices[card.id] ??= []);

    if (rerun && series.at(-1)?.[0] === at) series.pop();

    if (series.at(-1)?.[1] === price) continue;
    series.push([at, price]);
    moved++;
  }

  if (!rerun && (moved > 0 || days.length === 0)) days.push(today);

  return { ...trim({ days, prices }, keep), moved };
}

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
