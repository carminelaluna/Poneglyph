import { decks, type Deck } from './decks';
import { isNamedPlayer, playerSlug } from './meta';

/**
 * Player results.
 *
 * A player is a *name as it was reported*, not a verified person. The same handle
 * turning up in Limitless and in Top Decks is treated as one player — 147 names do,
 * and they are overwhelmingly the same competitor — but nothing here proves it, and
 * the page says which sources a record came from so the reader can judge.
 *
 * Names are never merged across different spellings. `Ric Masterflash` and
 * `ricmasterflash` stay separate, because guessing at identity would silently
 * invent a career.
 */

export { isNamedPlayer, playerSlug };

export type PlayerResult = {
  deckId: string;
  date: string;
  eventId?: string;
  eventName: string;
  eventType?: string;
  placing: number | null;
  record: { wins: number; losses: number; ties: number };
  leaderId: string;
  leaderName: string;
  colors: string[];
  region: string;
  source: string;
  players: number;
};

export type Player = {
  slug: string;
  /** Every spelling that produced this slug, most common first. */
  names: string[];
  name: string;
  results: PlayerResult[];
  wins: number;
  top8: number;
  events: number;
  archetypes: { leaderId: string; leaderName: string; colors: string[]; count: number }[];
  regions: string[];
  sources: string[];
  first: string;
  last: string;
};

const bySlug = new Map<string, { names: Map<string, number>; decks: Deck[] }>();

for (const deck of decks) {
  if (!isNamedPlayer(deck.player)) continue;
  const slug = playerSlug(deck.player);
  if (!slug) continue;

  let entry = bySlug.get(slug);
  if (!entry) {
    entry = { names: new Map(), decks: [] };
    bySlug.set(slug, entry);
  }
  entry.names.set(deck.player, (entry.names.get(deck.player) ?? 0) + 1);
  entry.decks.push(deck);
}

function build(slug: string, entry: { names: Map<string, number>; decks: Deck[] }): Player {
  const names = [...entry.names.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);

  const results: PlayerResult[] = entry.decks
    .map((d) => ({
      deckId: d.id,
      date: d.date.slice(0, 10),
      eventId: (d as Deck & { eventId?: string }).eventId,
      eventName: d.tournamentName,
      eventType: d.eventType,
      placing: d.placing,
      record: d.record,
      leaderId: d.leaderId,
      leaderName: d.leaderName,
      colors: d.colors,
      region: d.region ?? 'EN',
      source: d.source ?? 'limitless',
      players: d.tournamentPlayers ?? 0,
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || (a.placing ?? 999) - (b.placing ?? 999));

  const archetypes = new Map<string, { leaderId: string; leaderName: string; colors: string[]; count: number }>();
  for (const r of results) {
    const seen = archetypes.get(r.leaderId);
    if (seen) seen.count++;
    else
      archetypes.set(r.leaderId, {
        leaderId: r.leaderId,
        leaderName: r.leaderName,
        colors: r.colors,
        count: 1,
      });
  }

  const dates = results.map((r) => r.date).sort();

  return {
    slug,
    names,
    name: names[0],
    results,
    wins: results.filter((r) => r.placing === 1).length,
    top8: results.filter((r) => r.placing !== null && r.placing <= 8).length,
    /* Distinct days-plus-event, since one event can yield several recorded lists. */
    events: new Set(results.map((r) => `${r.date}|${r.eventName}`)).size,
    archetypes: [...archetypes.values()].sort((a, b) => b.count - a.count),
    regions: [...new Set(results.map((r) => r.region))],
    sources: [...new Set(results.map((r) => r.source))],
    first: dates[0] ?? '',
    last: dates.at(-1) ?? '',
  };
}

export const getPlayer = (slug: string): Player | undefined => {
  const entry = bySlug.get(slug.toLowerCase());
  return entry ? build(slug.toLowerCase(), entry) : undefined;
};

/** Slugs worth prerendering — everyone else renders on demand. */
export function prerenderablePlayers(minResults = 5) {
  return [...bySlug.entries()]
    .filter(([, e]) => e.decks.length >= minResults)
    .map(([slug]) => slug);
}

export const playerCount = bySlug.size;
