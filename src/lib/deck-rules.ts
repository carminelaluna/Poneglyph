export type DeckCard = {
  id: string;
  name: string;
  colors: string[];
  category: string;
  standard: 0 | 1;
};

export type Leader = DeckCard & { life: number | null };

export type Banlist = {
  banned: string[];
  restricted: string[];
  pairs: string[][];
};

export type Problem = {
  kind: 'error' | 'warning';
  cardId?: string;
  rule?: 'size';
  message: string;
};

export const DECK_SIZE = 50;

export const MAX_COPIES = 4;

export type Counted = { card: DeckCard; count: number };

export const totalCards = (deck: Counted[]) => deck.reduce((n, entry) => n + entry.count, 0);

export const colorsMatch = (leader: Leader, card: DeckCard) =>
  card.colors.every((color) => leader.colors.includes(color));

export function parseDeckList(text: string): { id: string; count: number }[] {
  const found = new Map<string, number>();

  for (const raw of String(text ?? '').split(/[\n\r]+/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    const lead = /^(\d{1,2})\s*[x*]?\s+?([A-Za-z]{1,4}\d{2}-\d{3}[A-Za-z0-9_]*)\b/.exec(line)
      ?? /^(\d{1,2})\s*[x*]\s*([A-Za-z]{1,4}\d{2}-\d{3}[A-Za-z0-9_]*)\b/.exec(line);
    const trail = lead ? null : /^([A-Za-z]{1,4}\d{2}-\d{3}[A-Za-z0-9_]*)\s*[x*]\s*(\d{1,2})\b/.exec(line);

    const id = (lead ? lead[2] : trail?.[1])?.toUpperCase().replace(/_[A-Z]\d*$/, '');
    const count = Number(lead ? lead[1] : trail?.[2]);
    if (!id || !Number.isFinite(count) || count < 1) continue;

    found.set(id, (found.get(id) ?? 0) + Math.min(count, 99));
  }

  return [...found.entries()].map(([id, count]) => ({ id, count }));
}

export function validate(
  leader: Leader | null,
  deck: Counted[],
  banlist: Banlist,
  format: 'Standard' | 'Extra'
): Problem[] {
  const problems: Problem[] = [];

  if (!leader) {
    problems.push({ kind: 'error', message: 'Pick a Leader to start.' });
    return problems;
  }

  const total = totalCards(deck);
  if (total !== DECK_SIZE) {
    problems.push({
      kind: 'error',
      rule: 'size',
      message:
        total < DECK_SIZE
          ? `${DECK_SIZE - total} more card${DECK_SIZE - total === 1 ? '' : 's'} needed — a deck is ${DECK_SIZE} plus the Leader.`
          : `${total - DECK_SIZE} too many — a deck is ${DECK_SIZE} plus the Leader.`,
    });
  }

  const held = new Set([leader.id, ...deck.map((entry) => entry.card.id)]);

  if (banlist.banned.includes(leader.id)) {
    problems.push({
      kind: 'error',
      cardId: leader.id,
      message: `${leader.name} is banned as a Leader.`,
    });
  }

  for (const { card, count } of deck) {
    if (count > MAX_COPIES) {
      problems.push({
        kind: 'error',
        cardId: card.id,
        message: `${card.name}: ${count} copies, and ${MAX_COPIES} is the limit.`,
      });
    }

    if (card.category === 'Leader') {
      problems.push({
        kind: 'error',
        cardId: card.id,
        message: `${card.name} is a Leader and cannot be in the deck.`,
      });
    }

    if (banlist.banned.includes(card.id)) {
      problems.push({ kind: 'error', cardId: card.id, message: `${card.name} is banned.` });
    }

    if (banlist.restricted.includes(card.id) && count > 1) {
      problems.push({
        kind: 'error',
        cardId: card.id,
        message: `${card.name} is restricted to one copy.`,
      });
    }

    if (format === 'Standard' && !card.standard) {
      problems.push({
        kind: 'error',
        cardId: card.id,
        message: `${card.name} has rotated out of Standard.`,
      });
    }

    if (!colorsMatch(leader, card)) {
      problems.push({
        kind: 'warning',
        cardId: card.id,
        message: `${card.name} is ${card.colors.join('/')} and ${leader.name} is ${leader.colors.join('/')} — check the Leader's text before playing it.`,
      });
    }
  }

  for (const pair of banlist.pairs) {
    if (pair.length === 2 && pair.every((id) => held.has(id))) {
      problems.push({
        kind: 'error',
        cardId: pair[0],
        message: `${pair[0]} and ${pair[1]} cannot be in the same deck.`,
      });
    }
  }

  if (format === 'Standard' && !leader.standard) {
    problems.push({
      kind: 'error',
      cardId: leader.id,
      message: `${leader.name} has rotated out of Standard.`,
    });
  }

  return problems;
}
