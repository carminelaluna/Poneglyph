/**
 * The corpus, one slice at a time.
 *
 * The event, player and deck pages are rendered in the browser. Prerendering all
 * 37,000 of them costs 5.5 GB of HTML and RSC against GitHub Pages' 1 GB limit, and
 * the alternative — shipping a whole region so the page can find its three rows —
 * is 362 KB gzipped to draw one small event.
 *
 * So `build-indexes.mjs` groups the corpus by entity and splits it into 64 buckets.
 * A page fetches the one bucket its id falls in, about 11-15 KB gzipped, plus a
 * shared archetype table. Everything is a static file, cached by the browser, so
 * moving between events costs one request the first time and none after.
 *
 * Rows are the same terse shape the metagame index uses, with `g` for the region.
 * The rebuilding below deliberately mirrors `lib/events.ts` and `lib/players.ts` —
 * those still run at build time for metadata and prerendering, and the two must
 * agree or a prerendered page and a fetched one would disagree about the same event.
 */
import type { MetaDeck } from './meta';
import { isNamedPlayer, playerSlug } from './meta';
import { dataUrl } from './paths';

export type Region = 'en' | 'jp';

/** One deck row as it arrives in a shard. */
export type ShardRow = MetaDeck & { g: Region };

export type Leaders = Record<string, { n: string; c: string[] }>;

/**
 * Which bucket a key falls in — FNV-1a.
 *
 * **`shardOf` in scripts/build-indexes.mjs is an identical copy** and the two must
 * agree exactly; if they drift, every lookup misses and every page reads as "not
 * found". `Math.imul` is what keeps the multiply in 32 bits, which is the whole
 * reason the two implementations can agree across Node and the browser.
 */
export function shardOf(key: string): string {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return String((hash >>> 0) % 64).padStart(2, '0');
}

/* Fetched buckets, kept for the life of the page so navigation is free. */
const cache = new Map<string, Promise<unknown>>();

function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  const held = cache.get(key);
  if (held) return held as Promise<T>;
  const started = load().catch((err) => {
    /* A failed fetch must not be cached, or a blip becomes permanent. */
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
  once('card-names', () => json<Record<string, [string, string]>>(dataUrl('card-names.json')));

/** Card lists for one archetype: deck id -> [[cardId, count], …]. */
export const loadArchetypeLists = (region: Region, leaderId: string) =>
  once(`decks-${region}/${leaderId}`, () =>
    json<Record<string, [string, number][]>>(dataUrl(`decks-${region}/${leaderId}.json`))
  );

/* ------------------------------------------------------------------ events */

export type ShardEvent = {
  id: string;
  name: string;
  date: string;
  players: number;
  recorded: number;
  region: Region;
  source: 'limitless' | 'topdecks';
  sourceUrl?: string;
  tier: string;
  venue: string;
  decks: ShardRow[];
  winner: ShardRow | null;
  archetypes: { leaderId: string; count: number }[];
};

/** Best finishes first, then the better record, then by name — as lib/events.ts does. */
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
    /* Entrants, when a source reported it — Top Decks does not, and 0 means that. */
    players: Math.max(...decks.map((d) => d.n ?? 0), 0),
    recorded: decks.length,
    region: head.g,
    source: head.o ? 'topdecks' : 'limitless',
    sourceUrl: head.u,
    tier: head.k ?? 'local',
    venue: head.v ?? 'unknown',
    decks,
    winner: decks.find((d) => d.p === 1) ?? null,
    archetypes: countArchetypes(decks),
  };
}

/* ----------------------------------------------------------------- players */

export type ShardPlayer = {
  slug: string;
  /** Every spelling that produced this slug, most common first. */
  names: string[];
  name: string;
  results: ShardRow[];
  wins: number;
  top8: number;
  events: number;
  archetypes: { leaderId: string; count: number }[];
  regions: Region[];
  /** First and last day on record, for the "Active" stat. */
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

  /*
   * Names are never merged across spellings — `Ric Masterflash` and
   * `ricmasterflash` are different people until something proves otherwise. What is
   * grouped here is one slug's spellings, ordered by how often each was reported.
   */
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
    /* Distinct day-plus-event, since one event can yield several recorded lists. */
    events: new Set(results.map((r) => `${r.d}|${r.e}`)).size,
    archetypes: countArchetypes(results),
    regions: [...new Set(results.map((r) => r.g))],
    /* `results` is newest first, so the ends of it are the active range. */
    last: results[0]?.d ?? '',
    first: results[results.length - 1]?.d ?? '',
  };
}

/* ------------------------------------------------------------------- decks */

export async function getDeckRow(id: string): Promise<ShardRow | null> {
  return (await bucket<ShardRow>('deck', id))[id] ?? null;
}

/** A deck's card list, resolved to names and categories. */
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
  }));
}

export { isNamedPlayer, playerSlug };
