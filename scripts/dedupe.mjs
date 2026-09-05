/**
 * Whether a decklist is already in the corpus under another source.
 *
 * Its own file, pure and import-free, for the reason the rest of this directory
 * splits things out: this decides whether a deck is counted, and a deck counted
 * twice moves a share and a win rate. A test has to be able to run it.
 *
 * ## Two tests, and why one was not enough
 *
 * **The same fifty cards.** Same day, same player, same Leader, same list — that is
 * one deck recorded twice and the strict answer. It catches 434 of them.
 *
 * **The same event.** 39 rows survived that: same day, player and Leader as a
 * Limitless row, but the fifty differ — 23 of them by a single entry, 11 by two.
 * The reading that kept them was that a player can bring one archetype to two
 * events in a day, which is real and happens 354 times inside Limitless alone. It
 * was the wrong reading here, and the evidence is in the data rather than in the
 * lists:
 *
 * Top Decks writes the field size into its event name — `ChinoizeCup(128)` — and
 * for 27 of the 39 that number equals the entrant count Limitless recorded for the
 * event this player was at. Checked by hand, `2026-08-19 mstrkenc OP16-001` is
 * Limitless's 128-deck field and Top Decks's top 16 of it, 14 of those 16 players
 * present in both, and the two lists differ by one card. So it is two sources
 * disagreeing about one list, not one player at two events.
 *
 * The one-card difference cannot settle it by itself — that is exactly what a
 * player does between two events on a Saturday — which is why the field size is
 * what this asks about instead. It is a fact about the *event*, and the event is
 * the thing the two rows either share or do not.
 *
 * ## What it deliberately does not do
 *
 * Nothing here compares lists for similarity. A threshold on how many of the fifty
 * match cannot separate "two sources typed the same deck differently" from "the
 * player swapped a card", because both look identical at one or two cards apart.
 *
 * And a loose key pointing at more than one Limitless event does not need a guard.
 * Both cases in the corpus are two 64-player cups at one venue on one day with the
 * same player in both; which of the two the Top Decks row duplicates is unknown and
 * does not matter, because the list is already recorded either way.
 */

/**
 * The smallest field the deck ingest will read, and so the smallest number in an
 * event name that can be one. It stops a stray parenthesised number — a year, a
 * shop's branch number — from being read as a field size. Every one of the 1,154
 * Top Decks names carrying a number is at or above it; the largest is 2,947.
 */
export const MIN_FIELD = 8;

/** `2026-08-19|mstrkenc|OP16-001` — the same event's row from any source. */
export const looseKey = (deck) =>
  [
    String(deck.date ?? '').slice(0, 10),
    String(deck.player ?? '')
      .trim()
      .toLowerCase(),
    deck.leaderId,
  ].join('|');

/** That, plus the fifty cards in a fixed order. Two identical lists share it. */
export const listKey = (deck) =>
  [
    looseKey(deck),
    (deck.cards ?? [])
      .slice()
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map((c) => `${c.count}x${c.id}`)
      .join(','),
  ].join('|');

/**
 * How many people played the event this deck came from, when that is knowable.
 *
 * Limitless and organizers report it outright. Top Decks does not, and puts it in
 * the event name instead, which is the only reason this parses a string at all.
 * `null` when there is no answer — never `0`, which would match an event whose
 * entrant count was not recorded.
 */
export function fieldSize(deck) {
  if (Number.isFinite(deck?.players) && deck.players >= MIN_FIELD) return deck.players;
  const named = /\((\d+)\)/.exec(String(deck?.eventName ?? ''));
  if (!named) return null;
  const size = Number(named[1]);
  return size >= MIN_FIELD ? size : null;
}

/**
 * What a corpus already holds, in the two shapes the tests below ask about.
 *
 * Built once from the authoritative rows and asked per candidate, rather than
 * rescanning: at 64,000 rows the naive version is the slow part of a rebuild.
 */
export function indexOf(rows) {
  const lists = new Set();
  const fields = new Map();

  for (const row of rows) {
    lists.add(listKey(row));
    /*
     * Skipping rather than storing a 0 is housekeeping, not the guard: `fieldSize`
     * returns null or a number at or above MIN_FIELD, never 0, and `recordedAs`
     * refuses a null before it ever asks this set. Proved by mutation — putting a 0
     * in here changes no test and no answer. What it would change is 64,000 sets
     * carrying a number nothing can match.
     */
    const size = fieldSize(row);
    if (size === null) continue;
    const key = looseKey(row);
    let sizes = fields.get(key);
    if (!sizes) fields.set(key, (sizes = new Set()));
    sizes.add(size);
  }

  return { lists, fields };
}

/**
 * Is this deck already recorded?
 *
 * Returns the reason rather than a bare boolean, because a run that drops rows
 * should be able to say which test dropped them — `list` is beyond argument,
 * `event` is the inference above and the one worth watching a number on.
 */
export function recordedAs(deck, index) {
  if (index.lists.has(listKey(deck))) return 'list';
  const size = fieldSize(deck);
  if (size !== null && index.fields.get(looseKey(deck))?.has(size)) return 'event';
  return null;
}

/** Split rows into the ones to keep and a tally of why the rest went. */
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
