export const MIN_FIELD = 8;

export const looseKey = (deck) =>
  [
    String(deck.date ?? '').slice(0, 10),
    String(deck.player ?? '')
      .trim()
      .toLowerCase(),
    deck.leaderId,
  ].join('|');

export const listKey = (deck) =>
  [
    looseKey(deck),
    (deck.cards ?? [])
      .slice()
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map((c) => `${c.count}x${c.id}`)
      .join(','),
  ].join('|');

export function fieldSize(deck) {
  if (Number.isFinite(deck?.players) && deck.players >= MIN_FIELD) return deck.players;
  const named = /\((\d+)\)/.exec(String(deck?.eventName ?? ''));
  if (!named) return null;
  const size = Number(named[1]);
  return size >= MIN_FIELD ? size : null;
}

export function indexOf(rows) {
  const lists = new Set();
  const fields = new Map();

  for (const row of rows) {
    lists.add(listKey(row));
    const size = fieldSize(row);
    if (size === null) continue;
    const key = looseKey(row);
    let sizes = fields.get(key);
    if (!sizes) fields.set(key, (sizes = new Set()));
    sizes.add(size);
  }

  return { lists, fields };
}

export function recordedAs(deck, index) {
  if (index.lists.has(listKey(deck))) return 'list';
  const size = fieldSize(deck);
  if (size !== null && index.fields.get(looseKey(deck))?.has(size)) return 'event';
  return null;
}

export function withoutRecorded(rows, index) {
  const kept = [];
  const dropped = { list: 0, event: 0 };
  for (const row of rows) {
    const why = recordedAs(row, index);
    if (why) dropped[why]++;
    else kept.push(row);
  }
  return { kept, dropped };
}
