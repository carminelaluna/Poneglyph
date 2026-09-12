import { decks, type Deck } from './decks';

export type EventDeck = Deck & { eventId: string };

export type TcgEvent = {
  id: string;
  name: string;
  date: string;
  players: number;
  recorded: number;
  region: string;
  source: string;
  tier: string;
  venue: string;
  eventType?: string;
  sourceUrl?: string;
  organizer?: string;
  decks: Deck[];
  winner: Deck | null;
  archetypes: { leaderId: string; leaderName: string; colors: string[]; count: number }[];
};

const byEvent = new Map<string, Deck[]>();
for (const deck of decks as EventDeck[]) {
  if (!deck.eventId) continue;
  const list = byEvent.get(deck.eventId) ?? [];
  list.push(deck);
  byEvent.set(deck.eventId, list);
}

function build(id: string, list: Deck[]): TcgEvent {
  const ordered = list
    .slice()
    .sort(
      (a, b) =>
        (a.placing ?? 9999) - (b.placing ?? 9999) ||
        b.record.wins - a.record.wins ||
        a.record.losses - b.record.losses ||
        a.player.localeCompare(b.player)
    );

  const archetypes = new Map<string, { leaderId: string; leaderName: string; colors: string[]; count: number }>();
  for (const deck of ordered) {
    const seen = archetypes.get(deck.leaderId);
    if (seen) seen.count++;
    else
      archetypes.set(deck.leaderId, {
        leaderId: deck.leaderId,
        leaderName: deck.leaderName,
        colors: deck.colors,
        count: 1,
      });
  }

  const head = ordered[0];
  return {
    id,
    name: head.tournamentName,
    date: head.date.slice(0, 10),
    players: Math.max(...ordered.map((d) => d.tournamentPlayers ?? 0), 0),
    recorded: ordered.length,
    region: head.region ?? 'EN',
    source: head.source ?? 'limitless',
    tier: head.tier ?? 'local',
    venue: head.venue ?? 'unknown',
    eventType: head.eventType,
    sourceUrl: head.sourceUrl,
    organizer: head.organizer,
    decks: ordered,
    winner: ordered.find((d) => d.placing === 1) ?? null,
    archetypes: [...archetypes.values()].sort((a, b) => b.count - a.count),
  };
}

export const getEvent = (id: string): TcgEvent | undefined => {
  const list = byEvent.get(id);
  return list ? build(id, list) : undefined;
};

export function prerenderableEvents(minDecks = 8) {
  return [...byEvent.entries()]
    .filter(([, list]) => list.length >= minDecks)
    .map(([id]) => id);
}
