export type Region = 'en' | 'jp';

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

export const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
