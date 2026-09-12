export const day = (value) => String(value ?? '').slice(0, 10);

export const UNKNOWN_PLAYER = 'Not recorded';
export const UNKNOWN_EVENT = 'Event not recorded';

export const named = (value, fallback) => {
  const text = String(value ?? '').trim();
  return text && !/^(na|n\/a|unknown|none|null)$/i.test(text) ? text : fallback;
};

export function toDecks(submission, cardsById) {
  const rows = submission.submission_decks ?? [];
  const date = day(submission.event_date);
  const eventName = named(submission.event_name, UNKNOWN_EVENT);

  return rows.map((row, index) => {
    const leader = cardsById?.get(row.leader_id);
    return {
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
      players: submission.players ?? 0,
      eventName,
      player: named(row.player, UNKNOWN_PLAYER),
      venue: submission.venue || 'unknown',
      tier: submission.tier || 'local',
      cards: (row.cards ?? []).map((c) => ({ id: c.id, count: c.count })),
      sampling: submission.sampling === 'field' ? 'field' : 'winners',
      region: submission.region === 'JP' ? 'JP' : 'EN',
      source: 'community',
      organizer: named(submission.organizer, null),
    };
  });
}
