/**
 * A submitted tournament, in the shape the corpus uses.
 *
 * Pure, and its own file, because this is where an organizer's answer becomes a
 * number other people read. Two of the mappings below decide what those numbers
 * mean, and both fail silently if they are wrong:
 *
 * **`sampling`** carries their answer to "is this the whole field or only the decks
 * that placed" through to every win rate. A winners-only event counted as a field
 * reads near 100% and means nothing.
 *
 * **`placing`** comes from a column called `place`, because PLACING is a reserved
 * word in PostgreSQL — see supabase/schema.sql. The corpus calls it `placing`, so
 * the rename happens here and nowhere else.
 */

/** `2026-08-26` from whatever shape the column comes back in. */
export const day = (value) => String(value ?? '').slice(0, 10);

/** Missing values are named, not blanked — the same rule the other ingests follow. */
export const UNKNOWN_PLAYER = 'Not recorded';
export const UNKNOWN_EVENT = 'Event not recorded';

export const named = (value, fallback) => {
  const text = String(value ?? '').trim();
  return text && !/^(na|n\/a|unknown|none|null)$/i.test(text) ? text : fallback;
};

/**
 * One submission becomes one event's worth of decks.
 *
 * Card names and colours are deliberately absent: build-indexes.mjs resolves those
 * from the card archive, and a name copied in here would be a second copy to go
 * stale when a card is errata'd.
 */
export function toDecks(submission, cardsById) {
  const rows = submission.submission_decks ?? [];
  const date = day(submission.event_date);
  const eventName = named(submission.event_name, UNKNOWN_EVENT);

  return rows.map((row, index) => {
    const leader = cardsById?.get(row.leader_id);
    return {
      /* Stable across runs: the same submission re-ingested keeps its deck ids. */
      id: `c-${submission.id}-${row.id ?? index}`,
      tournamentId: `c-${submission.id}`,
      date,
      leaderId: row.leader_id,
      leaderName: leader?.name ?? row.leader_id,
      colors: leader?.colors ?? [],
      placing: Number.isFinite(row.place) ? row.place : null,
      record: {
        wins: row.wins ?? 0,
        losses: row.losses ?? 0,
        ties: row.ties ?? 0,
      },
      /* Null entrants stay 0 here; the corpus reads 0 as "not recorded". */
      players: submission.players ?? 0,
      eventName,
      player: named(row.player, UNKNOWN_PLAYER),
      venue: submission.venue || 'unknown',
      tier: submission.tier || 'local',
      cards: (row.cards ?? []).map((c) => ({ id: c.id, count: c.count })),
      /* The organizer's answer, carried per deck like every other source. */
      sampling: submission.sampling === 'field' ? 'field' : 'winners',
      region: submission.region === 'JP' ? 'JP' : 'EN',
      source: 'community',
    };
  });
}
