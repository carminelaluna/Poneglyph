import archetypesJson from '@data/archetypes.json';
import decksMergedJson from '@data/decks-merged.json';
import tournamentsJson from '@data/tournaments.json';
import cardPlayJson from '@data/card-play.json';
import decksMetaJson from '@data/decks-meta.json';

export type DeckCard = { id: string; count: number; category: string };

export type Deck = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  date: string;
  tournamentPlayers: number;
  player: string;
  country: string | null;
  placing: number | null;
  record: { wins: number; losses: number; ties: number };
  leaderId: string;
  leaderName: string;
  colors: string[];
  total: number;
  unresolved: { set: string; number: string; name: string; count: number }[];
  /** Which corpus this came from — shown as provenance on the deck page. */
  region?: string;
  source?: string;
  eventType?: string;
  sourceUrl?: string;
  /** Who ran it, on a submitted event. Absent on the two automated sources. */
  organizer?: string;
  /** Which event this list came from — see lib/events.ts. */
  eventId?: string;
  /** How the event was played, and what kind of event it was. */
  venue?: string;
  tier?: string;
};

export type ArchetypeCard = {
  id: string;
  name: string;
  category: string;
  /** Share of this archetype's decks that run the card at all. */
  inclusion: number;
  /** Average copies in the decks that run it. */
  avgCopies: number;
  decks: number;
};

export type Archetype = {
  leaderId: string;
  slug: string;
  name: string;
  colors: string[];
  decks: number;
  share: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number | null;
  top8: number;
  firsts: number;
  core: ArchetypeCard[];
  flex: ArchetypeCard[];
  cards: ArchetypeCard[];
  lastSeen: string | null;
};

export type Tournament = {
  id: string;
  name: string;
  date: string;
  players: number;
  format: string | null;
  organizerId: number | null;
  decklistCount: number;
  source: string;
};

export type CardPlay = {
  decks: number;
  /** Share of all recorded decks that run the card. */
  share: number;
  avgCopies: number;
  archetypes: number;
};

export type DecksMeta = {
  generatedAt: string;
  source: { id: string; label: string; home: string; docs: string };
  counts: { tournaments: number; decks: number; archetypes: number; cardsPlayed: number };
  coverage: { tournamentsRead: number; oldest: string | null; newest: string | null };
  filters: { minPlayers: number; since: string | null };
};

export const archetypes = archetypesJson as Archetype[];
/**
 * Every recorded deck, from one canonical file.
 *
 * `build-indexes.mjs` merges the corpora, drops the 223 lists Limitless and Top
 * Decks both carry, and writes the result. Reading that instead of re-merging here
 * is what keeps a player page from disagreeing with the table that linked to it.
 */
type MergedDeck = {
  id: string;
  /* Present in the file, and not the same thing as `id`. */
  tournamentId: string | null;
  date: string;
  leaderId: string;
  leaderName: string;
  colors: string[];
  placing: number | null;
  record: { wins: number; losses: number; ties: number };
  players: number;
  eventName: string;
  player: string;
  venue: string;
  tier: string;
  /*
   * No `cards`. This file carries no card lists — build-indexes.mjs strips them,
   * because `resolveJsonModule` infers a literal type for every key and the whole
   * corpus with its fifties was 83 MB, where `tsc --noEmit` dies with *Ineffective
   * mark-compacts near heap limit*. Every page that shows the fifty fetches them.
   *
   * It was declared here as required anyway, and typechecked for months because
   * the shape TypeScript infers from a generated file depends on which optional
   * fields happen to appear in it. A Top Decks refresh changed that mix and the
   * build stopped — a data refresh failing a typecheck, which is the wrong thing
   * to be possible. The contract says what the file holds now, checked against all
   * 69,952 rows rather than read off one of them.
   */
  sampling: string;
  region?: string;
  source?: string;
  eventType?: string;
  sourceUrl?: string;
  organizer?: string;
  eventId: string;
  /* Written by build-indexes in place of the card list itself. */
  total: number;
};

const merged = (decksMergedJson as { decks: MergedDeck[] }).decks;

export const decks: Deck[] = merged.map((d) => ({
  id: d.id,
  tournamentId: d.id,
  tournamentName: d.eventName,
  date: d.date,
  tournamentPlayers: d.players ?? 0,
  player: d.player,
  country: null,
  placing: d.placing,
  record: d.record,
  leaderId: d.leaderId,
  leaderName: d.leaderName,
  colors: d.colors,
  /* The corpus this comes from carries no card lists — see build-indexes.mjs.
     Every page that shows the fifty cards fetches them instead. */
  cards: [],
  total: d.total,
  unresolved: [],
  region: d.region,
  source: d.source,
  eventType: d.eventType,
  sourceUrl: d.sourceUrl,
  organizer: d.organizer,
  eventId: d.eventId,
  venue: d.venue,
  tier: d.tier,
}));

export const tournaments = tournamentsJson as Tournament[];
export const cardPlay = cardPlayJson as Record<string, CardPlay>;
export const decksMeta = decksMetaJson as DecksMeta;

/** True once the deck ingest has run — every deck view is gated on this. */
export const hasDeckData = decks.length > 0;

const archetypeBySlug = new Map(archetypes.map((a) => [a.slug, a]));
const decksByLeader = new Map<string, Deck[]>();
const deckById = new Map(decks.map((d) => [d.id, d]));

for (const deck of decks) {
  const list = decksByLeader.get(deck.leaderId) ?? [];
  list.push(deck);
  decksByLeader.set(deck.leaderId, list);
}

export const getArchetype = (slug: string) => archetypeBySlug.get(slug.toLowerCase());
export const getDeck = (id: string) => deckById.get(id);
export const getPlay = (cardId: string): CardPlay | null => cardPlay[cardId] ?? null;

/** Which archetypes play a given card, and how heavily. */
export function cardArchetypes(cardId: string, limit = 8) {
  return archetypes
    .map((a) => {
      const hit = a.cards.find((c) => c.id === cardId);
      return hit ? { archetype: a, ...hit } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.archetype.decks - a.archetype.decks)
    .slice(0, limit);
}

export const formatRecord = (r: { wins: number; losses: number; ties: number }) =>
  r.ties ? `${r.wins}–${r.losses}–${r.ties}` : `${r.wins}–${r.losses}`;

export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};

/*
 * `groupDeck` used to live here and grouped a deck's fifty cards by category. It
 * had no callers: the deck page is drawn in the browser and keeps its own copy,
 * working from the shard it fetches. It went with the card lists it read.
 */
