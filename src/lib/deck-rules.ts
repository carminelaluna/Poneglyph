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
  /**
   * Which rule it came from, for a caller that already says this in its own way.
   * The builder prints a running `12 / 50` above the list and does not need the
   * same fact again as a red box; the rule itself stays, because "legal" has to
   * keep meaning fifty cards wherever it is asked.
   */
  rule?: 'size';
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

/**
 * A pasted decklist, back into card numbers and counts.
 *
 * The inverse of what `DeckExport` writes, and that is the point: an organizer
 * collecting lists already has them in the format OPTCGSim reads, and typing fifty
 * cards into a form thirty-two times is not something anyone will do twice.
 *
 * Tolerant on purpose. `4xOP01-025`, `4x OP01-025`, `4 OP01-025` and `OP01-025 x4`
 * all appear in the wild depending on who exported them, and a leading `1x` for the
 * Leader may or may not be there. Blank lines, stray commas and comment lines are
 * skipped rather than rejected — a list that is 49/50 because one line had a typo is
 * more useful to see than an error saying the whole paste was wrong.
 */
export function parseDeckList(text: string): { id: string; count: number }[] {
  const found = new Map<string, number>();

  for (const raw of String(text ?? '').split(/[\n\r]+/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    /* `4x OP01-025` and `4 OP01-025`, then `OP01-025 x4`. */
    const lead = /^(\d{1,2})\s*[x*]?\s+?([A-Za-z]{1,4}\d{2}-\d{3}[A-Za-z0-9_]*)\b/.exec(line)
      ?? /^(\d{1,2})\s*[x*]\s*([A-Za-z]{1,4}\d{2}-\d{3}[A-Za-z0-9_]*)\b/.exec(line);
    const trail = lead ? null : /^([A-Za-z]{1,4}\d{2}-\d{3}[A-Za-z0-9_]*)\s*[x*]\s*(\d{1,2})\b/.exec(line);

    /*
     * Uppercased, and the printing suffix dropped: `OP01-025_p2` is the same card as
     * `OP01-025` to a deck, and the corpus stores the base number. Keeping the suffix
     * would split one playset into two entries that each look under the limit.
     */
    const id = (lead ? lead[2] : trail?.[1])?.toUpperCase().replace(/_[A-Z]\d*$/, '');
    const count = Number(lead ? lead[1] : trail?.[2]);
    if (!id || !Number.isFinite(count) || count < 1) continue;

    /* The same number twice adds up, which is what a split list means. */
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

  /*
   * The Leader is in here too, and that was a real omission.
   *
   * Two of the five banned cards *are* Leaders — Nami OP03-040 and Trafalgar Law
   * ST10-001 — and the banned **pairs** include Leader OP11-040, which may not be
   * played alongside Charlotte Katakuri or Charlotte Linlin. Checking the banlist
   * only against the fifty let a banned Leader through reading "Legal in Standard".
   */
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
