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
  v: Venue;
  k: string;
  a: string;
  x?: string;
  f: 0 | 1;
  o?: 1 | 2;
  u?: string;
  z?: string;
};

export type Venue = 'simulator' | 'webcam' | 'offline' | 'unknown';

export const VENUES: { id: Venue; label: string; blurb: string }[] = [
  { id: 'offline', label: 'Paper', blurb: 'Played in person' },
  { id: 'simulator', label: 'Simulator', blurb: 'Played on a simulator' },
  { id: 'webcam', label: 'Webcam', blurb: 'Played over webcam' },
];

export type DeckCardLists = Record<string, [string, number][]>;

export type MetaIndex = {
  generatedAt: string;
  sampling?: 'field' | 'winners' | 'mixed';
  fieldDecks?: number;
  regionLabel?: string;
  sources?: string[];
  recentFrom?: string;
  archived?: number;
  archiveMonths?: string[];
  totalDecks?: number;
  window: { from: string | null; to: string | null };
  eras: Era[];
  tiers: { id: string; label: string }[];
  leaders: Record<string, { n: string; c: string[] }>;
  cards: Record<string, [string, string, (number | null)?]>;
  decks: MetaDeck[];
};

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
  winRateSample: number;
  top8: number;
  firsts: number;
};

export type Window =
  | { kind: 'days'; days: number }
  | { kind: 'all' }
  | { kind: 'era'; set: string };

export const DAY_WINDOWS = [7, 15, 30, 90] as const;

const eraIn = (window: Window, index: MetaIndex) =>
  window.kind === 'era' ? (index.eras.find((e) => e.set === window.set) ?? null) : null;

export function windowStart(window: Window, index: MetaIndex): string | null {
  if (window.kind === 'all') return null;

  if (window.kind === 'era') {
    return eraIn(window, index)?.from ?? null;
  }

  const latest = index.window.to;
  if (!latest) return null;
  const anchor = new Date(`${latest}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - window.days + 1);
  return anchor.toISOString().slice(0, 10);
}

export function windowEnd(window: Window, index: MetaIndex): string | null {
  if (window.kind !== 'era') return null;
  const era = index.eras.find((e) => e.set === window.set);
  if (!era) return null;
  const later = index.eras
    .filter((e) => e.kind === 'Expansion' && e.from > era.from)
    .map((e) => e.from)
    .sort();
  return later[0] ?? null;
}

export function archiveMonthsFor(window: Window, index: MetaIndex): string[] {
  const months = index.archiveMonths ?? [];
  const recentFrom = index.recentFrom;
  if (months.length === 0 || !recentFrom) return [];

  if (window.kind === 'era' && !eraIn(window, index)) return [];

  const from = windowStart(window, index);
  if (from && from >= recentFrom) return [];

  const end = windowEnd(window, index);
  const until = (end && end < recentFrom ? end : recentFrom).slice(0, 7);
  const since = from?.slice(0, 7) ?? '';

  return months.filter((m) => m >= since && m <= until);
}

export function windowLabel(window: Window, index: MetaIndex): string {
  if (window.kind === 'all') return 'All recorded results';
  if (window.kind === 'era') {
    const era = eraIn(window, index);
    if (!era) return 'That release never entered play in this corpus';
    return windowEnd(window, index) ? `While ${era.code} was current` : `Since ${era.code} entered play`;
  }
  return `Last ${window.days} days`;
}

export function filterDecks(
  index: MetaIndex,
  window: Window,
  venues: Venue[] = [],
  tiers: string[] = []
): MetaDeck[] {
  if (window.kind === 'era' && !eraIn(window, index)) return [];

  const from = windowStart(window, index);
  const to = windowEnd(window, index);
  const byVenue = venues.length > 0 && venues.length < VENUES.length;
  const byTier = tiers.length > 0 && tiers.length < index.tiers.length;
  if (!from && !to && !byVenue && !byTier) return index.decks;
  return index.decks.filter(
    (d) =>
      (!from || d.d >= from) &&
      (!to || d.d < to) &&
      (!byVenue || venues.includes(d.v)) &&
      (!byTier || tiers.includes(d.k))
  );
}

const CORE_THRESHOLD = 60;
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
  const until = windowEnd(window, index) ?? index.window.to ?? from;
  const span = daysBetween(from, until) + 1;
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

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

function shiftDays(day: string, by: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

const NOT_A_PLAYER = new Set([
  'na', 'n/a', 'unknown', 'none', 'null', 'nan', '-', '--', '?', '??',
  'anon', 'anonymous', 'player not recorded',
]);

export const isNamedPlayer = (name: string | null | undefined) => {
  const text = String(name ?? '').trim();
  return text.length > 0 && !NOT_A_PLAYER.has(text.toLowerCase());
};

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
