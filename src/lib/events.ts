import { decks, type Deck } from './decks';

/**
 * Events.
 *
 * An event is every recorded deck sharing one identity. Limitless supplies a real
 * tournament id; Top Decks supplies a venue name and a date, so those are keyed on
 * both — see `eventKey` in build-indexes.mjs, which assigns the id this reads.
 *
 * That key is honest rather than perfect: Top Decks venue names are generic
 * ("Cardshop" on 509 different days, "LGS" on 246), so two different shops using
 * the same name on the same day would appear here as one event. The page says how
 * many lists were recorded and where they came from, which is the information
 * needed to judge that.
 */

export type EventDeck = Deck & { eventId: string };

export type TcgEvent = {
  id: string;
  name: string;
  date: string;
  /** Entrants, when a source reported it — Top Decks does not. */
  players: number;
  /** How many decklists we hold, which is not the same as how many were played. */
  recorded: number;
  region: string;
  source: string;
  tier: string;
  venue: string;
  eventType?: string;
  sourceUrl?: string;
  /** Who ran it, when an organizer submitted it. */
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

/** How many lists we hold for an event — the link only appears when it is worth a page. */
export const eventSize = (eventId: string | undefined) =>
  eventId ? (byEvent.get(eventId)?.length ?? 0) : 0;

export const hasEventPage = (eventId: string | undefined) => eventSize(eventId) >= 2;

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

/** Events with enough recorded lists to be worth prerendering. */
export function prerenderableEvents(minDecks = 8) {
  return [...byEvent.entries()]
    .filter(([, list]) => list.length >= minDecks)
    .map(([id]) => id);
}

/** Biggest recorded events, for the metagame page's footer. */
export function largestEvents(limit = 10) {
  return [...byEvent.entries()]
    .map(([id, list]) => build(id, list))
    .sort((a, b) => b.recorded - a.recorded || b.date.localeCompare(a.date))
    .slice(0, limit);
}

export const eventCount = byEvent.size;
