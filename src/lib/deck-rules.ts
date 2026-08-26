/**
 * What makes a deck legal.
 *
 * Deliberately free of imports, like `lib/meta.ts`: it takes a leader, a list of
 * cards and a banlist, and gives back problems. Nothing here reads a file or the
 * network, so it runs the same in the builder and in a test.
 *
 * The distinction that matters is **error versus warning**. An error is something
 * the rules state outright and this data can check — fifty cards, four copies. A
 * warning is something that is true of every deck ever recorded but that a card
 * could be printed to change, and there the builder says so and lets you carry on.
 */

export type DeckCard = {
  /** Card number, which is what the copy limit counts. */
  id: string;
  name: string;
  colors: string[];
  category: string;
  /** 1 when Standard-legal, 0 when it has rotated to Extra only. */
  standard: 0 | 1;
};

export type Leader = DeckCard & { life: number | null };

export type Banlist = {
  banned: string[];
  restricted: string[];
  /** Cards that may not appear in the same deck, as pairs of card numbers. */
  pairs: string[][];
};

export type Problem = {
  kind: 'error' | 'warning';
  /** What it is about, so the builder can point at the offending card. */
  cardId?: string;
  message: string;
};

/** A deck is a Leader and fifty other cards. */
export const DECK_SIZE = 50;

/** Four of any one card number — the rule counts numbers, not printings. */
export const MAX_COPIES = 4;

export type Counted = { card: DeckCard; count: number };

export const totalCards = (deck: Counted[]) => deck.reduce((n, entry) => n + entry.count, 0);

/**
 * Whether a card may go in a deck led by this leader.
 *
 * Every colour on the card has to be a colour on the leader. Checked against 63,155
 * card-and-leader pairs from recorded decks: not one plays a card carrying a colour
 * its leader does not have. (Four rows appear to, all from a single decklist whose
 * data is wrong — the leader there is mono-Purple in 63 of its other 64 decks.)
 *
 * It is still only a warning. `P-117 Nami` carries a deckbuilding clause in its own
 * text, and a future leader can do the same; a builder that refused the card would
 * be confidently wrong, where one that flags it is merely noisy.
 */
export const colorsMatch = (leader: Leader, card: DeckCard) =>
  card.colors.every((color) => leader.colors.includes(color));

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
      message:
        total < DECK_SIZE
          ? `${DECK_SIZE - total} more card${DECK_SIZE - total === 1 ? '' : 's'} needed — a deck is ${DECK_SIZE} plus the Leader.`
          : `${total - DECK_SIZE} too many — a deck is ${DECK_SIZE} plus the Leader.`,
    });
  }

  const held = new Set(deck.map((entry) => entry.card.id));

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

  /* Cards Bandai has banned as a combination rather than individually. */
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

/* ------------------------------------------------------------- sharing */

/**
 * A deck as a string, for the address bar.
 *
 * `OP16-060|OP16-061x4,OP12-108x2` — the leader, then counts. Long, and readable,
 * which is the point: a link someone pastes into a chat should be inspectable, and
 * compressing it would save a few hundred bytes to make it opaque.
 */
export function encodeDeck(leaderId: string | null, counts: Iterable<[string, number]>) {
  if (!leaderId) return '';
  const cards = [...counts]
    .filter(([, count]) => count > 0)
    .map(([id, count]) => `${id}${count > 1 ? `x${count}` : ''}`)
    .join(',');
  return cards ? `${leaderId}|${cards}` : leaderId;
}

export function decodeDeck(text: string): { leaderId: string | null; counts: Map<string, number> } {
  const counts = new Map<string, number>();
  if (!text) return { leaderId: null, counts };

  const [leaderId, list = ''] = text.split('|');
  for (const part of list.split(',').filter(Boolean)) {
    const [id, times] = part.split('x');
    const count = Number(times ?? 1);
    /* Anything unreadable is skipped rather than throwing — this comes from a URL. */
    if (id && Number.isFinite(count) && count > 0) counts.set(id, Math.min(count, 99));
  }
  return { leaderId: leaderId || null, counts };
}
