import type {
  EventRow,
  PlayerIndex,
  PlayerRow,
  TournamentIndex,
} from './directory';
import type { MetaDeck } from './meta';
import { isNamedPlayer, playerSlug } from './meta';
import { dataUrl } from './paths';

export type Region = 'en' | 'jp';

export type ShardRow = MetaDeck & { g: Region };

export type Leaders = Record<string, { n: string; c: string[]; $?: number | null }>;

export type CardNames = Record<string, [string, string, (number | null)?]>;

export function shardOf(key: string): string {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return String((hash >>> 0) % 256).padStart(3, '0');
}

const cache = new Map<string, Promise<unknown>>();

function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  const held = cache.get(key);
  if (held) return held as Promise<T>;
  const started = load().catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, started);
  return started;
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} — HTTP ${res.status}`);
  return (await res.json()) as T;
}

const bucket = <T>(kind: string, key: string) =>
  once(`${kind}/${shardOf(key)}`, () =>
    json<Record<string, T>>(dataUrl(`${kind}/${shardOf(key)}.json`))
  );

export const loadLeaders = () => once('leaders', () => json<Leaders>(dataUrl('leaders.json')));

export const loadCardNames = () =>
  once('card-names', () => json<CardNames>(dataUrl('card-names.json')));

export const loadTournaments = () =>
  once('tournaments', () => json<TournamentIndex>(dataUrl('tournaments-index.json')));

export const loadTournamentArchive = () =>
  once('tournaments-archive', () =>
    json<{ events: EventRow[] }>(dataUrl('tournaments-archive.json'))
  );

export const loadPlayers = () =>
  once('players-index', () => json<PlayerIndex>(dataUrl('players-index.json')));

export const loadPlayerArchive = () =>
  once('players-archive', () => json<{ players: PlayerRow[] }>(dataUrl('players-archive.json')));

export const loadArchetypeLists = (region: Region, leaderId: string) =>
  once(`decks-${region}/${leaderId}`, () =>
    json<Record<string, [string, number][]>>(dataUrl(`decks-${region}/${leaderId}.json`))
  );

export type ShardEvent = {
  id: string;
  name: string;
  date: string;
  players: number;
  recorded: number;
  region: Region;
  source: 'limitless' | 'topdecks' | 'community';
  sourceUrl?: string;
  organizer?: string;
  tier: string;
  venue: string;
  decks: ShardRow[];
  winner: ShardRow | null;
  archetypes: { leaderId: string; count: number }[];
};

const byFinish = (a: ShardRow, b: ShardRow) =>
  (a.p ?? 9999) - (b.p ?? 9999) || b.w - a.w || a.s - b.s || a.a.localeCompare(b.a);

function countArchetypes(rows: ShardRow[]) {
  const seen = new Map<string, number>();
  for (const row of rows) seen.set(row.l, (seen.get(row.l) ?? 0) + 1);
  return [...seen.entries()]
    .map(([leaderId, count]) => ({ leaderId, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getEvent(id: string): Promise<ShardEvent | null> {
  const rows = (await bucket<ShardRow[]>('events', id))[id];
  if (!rows || rows.length === 0) return null;

  const decks = rows.slice().sort(byFinish);
  const head = decks[0];

  return {
    id,
    name: head.e,
    date: head.d,
    players: Math.max(...decks.map((d) => d.n ?? 0), 0),
    recorded: decks.length,
    region: head.g,
    source: head.o === 2 ? 'community' : head.o === 1 ? 'topdecks' : 'limitless',
    sourceUrl: head.u,
    organizer: head.z,
    tier: head.k ?? 'local',
    venue: head.v ?? 'unknown',
    decks,
    winner: decks.find((d) => d.p === 1) ?? null,
    archetypes: countArchetypes(decks),
  };
}

export type ShardPlayer = {
  slug: string;
  names: string[];
  name: string;
  results: ShardRow[];
  wins: number;
  top8: number;
  events: number;
  archetypes: { leaderId: string; count: number }[];
  regions: Region[];
  first: string;
  last: string;
};

export async function getPlayer(slug: string): Promise<ShardPlayer | null> {
  const key = slug.toLowerCase();
  const rows = (await bucket<ShardRow[]>('players', key))[key];
  if (!rows || rows.length === 0) return null;

  const results = rows
    .slice()
    .sort((a, b) => b.d.localeCompare(a.d) || (a.p ?? 999) - (b.p ?? 999));

  const spellings = new Map<string, number>();
  for (const row of results) spellings.set(row.a, (spellings.get(row.a) ?? 0) + 1);
  const names = [...spellings.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);

  return {
    slug: key,
    names,
    name: names[0],
    results,
    wins: results.filter((r) => r.p === 1).length,
    top8: results.filter((r) => r.p !== null && r.p <= 8).length,
    events: new Set(results.map((r) => `${r.d}|${r.e}`)).size,
    archetypes: countArchetypes(results),
    regions: [...new Set(results.map((r) => r.g))],
    last: results[0]?.d ?? '',
    first: results[results.length - 1]?.d ?? '',
  };
}

export async function getDeckRow(id: string): Promise<ShardRow | null> {
  return (await bucket<ShardRow>('deck', id))[id] ?? null;
}

export async function getDeckCards(row: ShardRow) {
  const [lists, names] = await Promise.all([
    loadArchetypeLists(row.g, row.l),
    loadCardNames(),
  ]);
  const list = lists[row.i];
  if (!list) return null;
  return list.map(([id, count]) => ({
    id,
    count,
    name: names[id]?.[0] ?? id,
    category: names[id]?.[1] ?? '',
    price: names[id]?.[2] ?? null,
  }));
}

export { isNamedPlayer, playerSlug };
