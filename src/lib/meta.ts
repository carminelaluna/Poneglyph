/**
 * Metagame aggregation.
 *
 * Deliberately free of imports so the exact same code runs in the browser, where
 * the reader picks a time window and the whole table is recomputed. Nothing here
 * touches the filesystem or the network — it takes decks in and gives archetypes
 * back.
 */

/**
 * One deck as it travels to the browser. Keys are terse because this file is
 * downloaded by every visitor to the metagame page.
 *
 * Card lists are deliberately absent: they are five times heavier than the rest
 * and only the archetype page needs them, one archetype at a time. They live in
 * public/data/decks/{leaderId}.json and are keyed by deck id.
 */
export type MetaDeck = {
  i: string;
  l: string;
  d: string;
  p: number | null;
  w: number;
  s: number;
  t: number;
  n: number;
  e: string;
  /** How the event was played: simulator, webcam, offline, or unknown. */
  v: Venue;
  /** What kind of event it was: regional, treasure, championship, local, … */
  k: string;
  /** Who played it. */
  a: string;
  /** Which event it was played at. */
  x?: string;
  /** 1 when this deck came from a whole-field sample, 0 when it only placed. */
  f: 0 | 1;
  /**
   * 1 when the result came from Top Decks rather than Limitless, and the page it
   * came from. Absent on Limitless rows.
   *
   * `f` implies this today, since every Limitless row is a whole field and every
   * Top Decks row is winners-only, but that is a fact about the two upstreams we
   * happen to have rather than a rule — so attribution is recorded rather than
   * inferred from a sampling flag.
   */
  o?: 1;
  u?: string;
};

export type Venue = 'simulator' | 'webcam' | 'offline' | 'unknown';

/**
 * Play settings, in the order they are offered.
 *
 * Most recorded results come from simulator events, so someone asking "what wins
 * across a table" is asking a different question from "what wins overall" — this
 * is the control that separates them.
 */
export const VENUES: { id: Venue; label: string; blurb: string }[] = [
  { id: 'offline', label: 'Paper', blurb: 'Played in person' },
  { id: 'simulator', label: 'Simulator', blurb: 'Played on a simulator' },
  { id: 'webcam', label: 'Webcam', blurb: 'Played over webcam' },
];

/** Card lists for one archetype: deck id -> [[cardId, count], ...]. */
export type DeckCardLists = Record<string, [string, number][]>;

export type MetaIndex = {
  generatedAt: string;
  /**
   * How the corpus was collected. `field` is every deck in a Swiss event, so win
   * rate is meaningful. `winners` is only decks that placed, so share answers
   * "what wins" but a win rate would be an artefact of the sampling.
   */
  sampling?: 'field' | 'winners' | 'mixed';
  /** How many decks in this corpus came from whole fields. */
  fieldDecks?: number;
  regionLabel?: string;
  sources?: string[];
  /** Oldest day the first payload carries; older decks live in the archive file. */
  recentFrom?: string;
  archived?: number;
  /** Size of the whole corpus, including the part in the archive file. */
  totalDecks?: number;
  window: { from: string | null; to: string | null };
  eras: Era[];
  tiers: { id: string; label: string }[];
  leaders: Record<string, { n: string; c: string[] }>;
  cards: Record<string, [string, string, (number | null)?]>;
  decks: MetaDeck[];
};

/** When a set first showed up in tournament results — see buildEras in the ingest. */
export type Era = {
  code: string;
  set: string;
  from: string;
  kind: 'Expansion' | 'Starter deck';
  decks: number;
};

export type MetaCard = {
  id: string;
  name: string;
  category: string;
  inclusion: number;
  avgCopies: number;
  decks: number;
};

export type MetaArchetype = {
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
  /** Decks the win rate was computed from — only whole-field results count. */
  winRateSample: number;
  top8: number;
  firsts: number;
};

/* ------------------------------------------------------------------ windows */

export type Window =
  | { kind: 'days'; days: number }
  | { kind: 'all' }
  | { kind: 'era'; set: string };

export const DAY_WINDOWS = [7, 15, 30, 90] as const;

/**
 * The window is measured back from the most recent deck on record, not from
 * today. Results arrive in batches, so anchoring on the clock would quietly empty
 * "last 7 days" whenever ingestion paused for a week.
 */
export function windowStart(window: Window, index: MetaIndex): string | null {
  if (window.kind === 'all') return null;

  if (window.kind === 'era') {
    return index.eras.find((e) => e.set === window.set)?.from ?? null;
  }

  const latest = index.window.to;
  if (!latest) return null;
  const anchor = new Date(`${latest}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - window.days + 1);
  return anchor.toISOString().slice(0, 10);
}

export function windowLabel(window: Window, index: MetaIndex): string {
  if (window.kind === 'all') return 'All recorded results';
  if (window.kind === 'era') {
    const era = index.eras.find((e) => e.set === window.set);
    return era ? `Since ${era.code} entered play` : 'Since set release';
  }
  return `Last ${window.days} days`;
}

export function filterDecks(
  index: MetaIndex,
  window: Window,
  venues: Venue[] = [],
  tiers: string[] = []
): MetaDeck[] {
  const from = windowStart(window, index);
  const byVenue = venues.length > 0 && venues.length < VENUES.length;
  const byTier = tiers.length > 0 && tiers.length < index.tiers.length;
  if (!from && !byVenue && !byTier) return index.decks;
  return index.decks.filter(
    (d) =>
      (!from || d.d >= from) &&
      (!byVenue || venues.includes(d.v)) &&
      (!byTier || tiers.includes(d.k))
  );
}

/* -------------------------------------------------------------- aggregation */

/** A card in at least this share of an archetype's lists is part of its skeleton. */
const CORE_THRESHOLD = 60;
/** Below this, a card is noise rather than a real build choice. */
const FLEX_THRESHOLD = 10;

export function aggregate(decks: MetaDeck[], index: MetaIndex): MetaArchetype[] {
  type Bucket = {
    decks: number;
    wins: number;
    losses: number;
    ties: number;
    top8: number;
    firsts: number;
    fieldDecks: number;
  };

  const buckets = new Map<string, Bucket>();

  for (const deck of decks) {
    let bucket = buckets.get(deck.l);
    if (!bucket) {
      bucket = { decks: 0, wins: 0, losses: 0, ties: 0, top8: 0, firsts: 0, fieldDecks: 0 };
      buckets.set(deck.l, bucket);
    }
    bucket.decks++;
    if (deck.p !== null && deck.p <= 8) bucket.top8++;
    if (deck.p === 1) bucket.firsts++;

    /*
     * Records only count when the deck came from a whole field. A corpus of decks
     * that placed would otherwise report a win rate near 100% — true of the sample,
     * meaningless about the archetype.
     */
    if (deck.f === 1) {
      bucket.fieldDecks++;
      bucket.wins += deck.w;
      bucket.losses += deck.s;
      bucket.ties += deck.t;
    }
  }

  const total = decks.length || 1;

  return [...buckets.entries()]
    .map(([leaderId, b]) => {
      const games = b.wins + b.losses + b.ties;
      const leader = index.leaders[leaderId];
      return {
        leaderId,
        slug: leaderId.toLowerCase(),
        name: leader?.n ?? leaderId,
        colors: leader?.c ?? [],
        decks: b.decks,
        share: round2((b.decks / total) * 100),
        wins: b.wins,
        losses: b.losses,
        ties: b.ties,
        winRate: games ? round1((b.wins / games) * 100) : null,
        winRateSample: b.fieldDecks,
        top8: b.top8,
        firsts: b.firsts,
      };
    })
    .sort((a, b) => b.decks - a.decks || a.name.localeCompare(b.name));
}

/**
 * What the decks in this window are actually built out of. Split from `aggregate`
 * because it needs the card lists, which are fetched per archetype rather than
 * shipped with the table.
 */
export function archetypeCards(
  deckIds: string[],
  lists: DeckCardLists,
  index: MetaIndex
): { cards: MetaCard[]; core: MetaCard[]; flex: MetaCard[] } {
  const tally = new Map<string, { decks: number; copies: number }>();
  let counted = 0;

  for (const id of deckIds) {
    const list = lists[id];
    if (!list) continue;
    counted++;
    for (const [cardId, count] of list) {
      const stat = tally.get(cardId);
      if (stat) {
        stat.decks++;
        stat.copies += count;
      } else {
        tally.set(cardId, { decks: 1, copies: count });
      }
    }
  }

  if (counted === 0) return { cards: [], core: [], flex: [] };

  const cards = [...tally.entries()]
    .map(([id, stat]) => {
      const info = index.cards[id];
      return {
        id,
        name: info?.[0] ?? id,
        category: info?.[1] ?? 'Unknown',
        inclusion: round1((stat.decks / counted) * 100),
        avgCopies: round2(stat.copies / stat.decks),
        decks: stat.decks,
      };
    })
    .sort((a, b) => b.inclusion - a.inclusion || b.avgCopies - a.avgCopies);

  return {
    cards,
    core: cards.filter((c) => c.inclusion >= CORE_THRESHOLD),
    flex: cards.filter((c) => c.inclusion < CORE_THRESHOLD && c.inclusion >= FLEX_THRESHOLD),
  };
}

/**
 * Movement against the window immediately before this one. A deck that is 8% of
 * the field says less than a deck that was 3% a fortnight ago.
 */
export function withTrend(
  current: MetaArchetype[],
  index: MetaIndex,
  window: Window,
  venues: Venue[] = [],
  tiers: string[] = []
): (MetaArchetype & { delta: number | null })[] {
  const from = windowStart(window, index);
  if (!from) return current.map((a) => ({ ...a, delta: null }));

  const byVenue = venues.length > 0 && venues.length < VENUES.length;
  const byTier = tiers.length > 0 && tiers.length < index.tiers.length;
  const span = daysBetween(from, index.window.to ?? from) + 1;
  const previousStart = shiftDays(from, -span);
  const previous = index.decks.filter(
    (d) =>
      d.d >= previousStart &&
      d.d < from &&
      (!byVenue || venues.includes(d.v)) &&
      (!byTier || tiers.includes(d.k))
  );
  if (previous.length < 30) return current.map((a) => ({ ...a, delta: null }));

  const before = new Map(aggregate(previous, index).map((a) => [a.leaderId, a.share]));
  return current.map((a) => {
    const was = before.get(a.leaderId);
    return { ...a, delta: was === undefined ? null : round2(a.share - was) };
  });
}

/* ------------------------------------------------------------------ helpers */

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

function shiftDays(day: string, by: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

/**
 * Values a source used to mean "not recorded". Mirrors the server-side list in
 * lib/players.ts — a placeholder must not become a clickable career.
 */
const NOT_A_PLAYER = new Set([
  'na', 'n/a', 'unknown', 'none', 'null', 'nan', '-', '--', '?', '??',
  'anon', 'anonymous', 'player not recorded',
]);

export const isNamedPlayer = (name: string | null | undefined) => {
  const text = String(name ?? '').trim();
  return text.length > 0 && !NOT_A_PLAYER.has(text.toLowerCase());
};

/** URL form of a player name. Must match lib/players.ts exactly. */
export function playerSlug(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 64);
}

export const formatRecord = (w: number, l: number, t: number) =>
  t ? `${w}–${l}–${t}` : `${w}–${l}`;

export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};
