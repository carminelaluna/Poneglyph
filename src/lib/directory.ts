/**
 * The two lists that let you start from an event or a person.
 *
 * Everything on this site could be reached from a decklist and almost nothing
 * could be reached without one: 7,163 recorded tournaments and 8,686 players had
 * pages, and no page listed them. (`/events` is Bandai's announced calendar, which
 * answers "where can I go and play", not "what has been played".)
 *
 * Rows arrive as arrays, positionally, because a list of eight thousand objects
 * spends a third of its bytes repeating key names. The positions are written down
 * in `writeDirectories` in scripts/build-indexes.mjs and read back here, so the two
 * have to agree — `tests/parity.test.ts` compares them rather than trusting it.
 *
 * Split by recency and by how often someone appears, the same way the metagame
 * index is split: the first file answers the question most people arrive with, and
 * the tail is one deliberate fetch behind it.
 *
 * Free of imports, like `lib/meta.ts` next to `lib/shards.ts`: the shapes and the
 * arithmetic live here, and the four fetches that pull the files live with the
 * other payload loaders in `lib/shards.ts`. That is also what lets a test read
 * these back without a bundler.
 */
export type Region = 'en' | 'jp';

/* [id, name, date, region, tier, venue, recorded, entrants, winnerLeader] */
export type EventRow = [
  string,
  string,
  string,
  Region,
  string,
  string,
  number,
  number,
  string,
];

/* [slug, name, results, events, top8, firsts, last, mainLeader, regions] */
export type PlayerRow = [
  string,
  string,
  number,
  number,
  number,
  number,
  string,
  string,
  Region | 'both',
];

export type EventEntry = {
  id: string;
  name: string;
  date: string;
  region: Region;
  tier: string;
  venue: string;
  recorded: number;
  entrants: number;
  winner: string;
};

export type PlayerEntry = {
  slug: string;
  name: string;
  results: number;
  events: number;
  top8: number;
  firsts: number;
  last: string;
  main: string;
  regions: Region | 'both';
};

export const toEvent = (row: EventRow): EventEntry => ({
  id: row[0],
  name: row[1],
  date: row[2],
  region: row[3],
  tier: row[4],
  venue: row[5],
  recorded: row[6],
  entrants: row[7],
  winner: row[8],
});

export const toPlayer = (row: PlayerRow): PlayerEntry => ({
  slug: row[0],
  name: row[1],
  results: row[2],
  events: row[3],
  top8: row[4],
  firsts: row[5],
  last: row[6],
  main: row[7],
  regions: row[8],
});

export type TournamentIndex = {
  generatedAt: string;
  total: number;
  recentFrom: string | null;
  archived: number;
  events: EventRow[];
};

export type PlayerIndex = {
  generatedAt: string;
  total: number;
  minResults: number;
  archived: number;
  players: PlayerRow[];
};

/* ------------------------------------------------------------- vocabulary */

/** Matches the TIERS table in build-indexes.mjs; unknown values pass through. */
export const TIER_LABELS: Record<string, string> = {
  local: 'Local',
  store: 'Store',
  regional: 'Regional',
  treasure: 'Treasure Cup',
  championship: 'Championship',
  qualifier: 'Qualifier',
  finals: 'Finals',
  worlds: 'Worlds',
  unknown: 'Not recorded',
};

export const VENUE_LABELS: Record<string, string> = {
  offline: 'Paper',
  simulator: 'Simulator',
  webcam: 'Webcam',
  unknown: 'Not recorded',
};

export const tierLabel = (tier: string) => TIER_LABELS[tier] ?? tier;
export const venueLabel = (venue: string) => VENUE_LABELS[venue] ?? venue;

/**
 * Case- and accent-insensitive matching, so searching "munoz" finds "Muñoz".
 *
 * Deliberately not `playerSlug`: that truncates and collapses to hyphens, which is
 * right for a URL and wrong for "does this name contain what was typed".
 */
export const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    /* Escaped, not literal: a combining mark in a regex is invisible in a diff. */
    .replace(/[\u0300-\u036f]/g, '');
