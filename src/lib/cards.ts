import cardsJson from '@data/cards.json';
import setsJson from '@data/sets.json';
import filtersJson from '@data/filters.json';
import metaJson from '@data/meta.json';

/** One printing of a card: the same rules text on a different piece of cardboard. */
export type Printing = {
  id: string;
  /** 1 for the original printing, 2+ for each later art. */
  version: number;
  /** How the printing is named in the interface: `OP01-025`, `OP01-025 V2`, … */
  label: string;
  variant: string;
  rarity: string;
  rarityCode: string;
  image: string | null;
  imageMirror: string | null;
  setId: string;
  price: { market: number | null; low: number | null; updated: string | null } | null;
};

/** A card: the gameplay entity, with every printing of it attached. */
export type Card = {
  id: string;
  slug: string;
  name: string;
  category: string;
  colors: string[];
  colorIdentity: string;
  cost: number | null;
  life: number | null;
  power: number | null;
  counter: number | null;
  attributes: string[];
  types: string[];
  keywords: string[];
  effect: string | null;
  trigger: string | null;
  blockNumber: number | null;
  rarity: string;
  rarityCode: string;
  /** Which formats the card may be played in today. */
  formats: string[];
  standardLegal: boolean;
  /** `block` when the block allows it, `block-update` for Bandai's published exception. */
  legalBy: 'block' | 'block-update' | null;
  setId: string;
  setCode: string;
  setName: string;
  setGroup: string;
  printings: Printing[];
  printingCount: number;
  image: string | null;
  priceLow: number | null;
  priceHigh: number | null;
  search: string;
};

export type CardSet = {
  id: string;
  code: string;
  name: string;
  prefix: string;
  group: string;
  rawTitle: string;
  sortKey: string;
  slug: string;
  cardCount: number;
  printingCount: number;
};

export type Facet = { value: string | number; count: number };
export type SetFacet = Facet & { id: string; name: string; group: string };

export type Filters = {
  colors: Facet[];
  categories: Facet[];
  rarities: Facet[];
  attributes: Facet[];
  costs: Facet[];
  lives: Facet[];
  powers: Facet[];
  counters: Facet[];
  keywords: Facet[];
  types: Facet[];
  setGroups: Facet[];
  formats: Facet[];
  blocks: Facet[];
  sets: SetFacet[];
};

export type Meta = {
  site: string;
  language: string;
  generatedAt: string;
  upstreamBuiltAt: string | null;
  counts: {
    cards: number;
    printings: number;
    sets: number;
    withEffect: number;
    withPrice: number;
    traits: number;
    keywords: number;
  };
  coverage: { effect: number; price: number; block: number };
  formats: {
    standardMinBlock: number;
    note: string;
    keptByBlockUpdate: number;
    standardLegal: number;
    extraOnly: number;
  };
  sources: { id: string; label: string; home: string; role: string }[];
  durationMs: number;
};

export const cards = cardsJson as Card[];
export const sets = setsJson as CardSet[];
export const filters = filtersJson as Filters;
export const meta = metaJson as Meta;

const byId = new Map(cards.map((c) => [c.id.toLowerCase(), c]));
const bySetCode = new Map<string, Card[]>();
for (const card of cards) {
  const list = bySetCode.get(card.setCode) ?? [];
  list.push(card);
  bySetCode.set(card.setCode, list);
}

export const getCard = (id: string) => byId.get(id.toLowerCase());
export const getSet = (slug: string) => sets.find((s) => s.slug === slug.toLowerCase());
export const getSetCards = (code: string) => bySetCode.get(code) ?? [];

/** Newest first, boosters before starter decks — the order the sets list already carries. */
export const latestSets = (n: number) => sets.filter((s) => s.group === 'Booster Set').slice(0, n);

export const CARD_COLORS = ['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'] as const;
export type CardColor = (typeof CARD_COLORS)[number];

/** Cards per colour, in the game's own colour order — drives the spectrum band. */
export function colorSpectrum() {
  const counts = new Map<string, number>();
  for (const card of cards) for (const c of card.colors) counts.set(c, (counts.get(c) ?? 0) + 1);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return CARD_COLORS.map((color) => ({
    color,
    count: counts.get(color) ?? 0,
    share: total ? (counts.get(color) ?? 0) / total : 0,
  }));
}

/* Art URLs live in their own module so client components can use them without
   pulling the card JSON into the browser bundle. Re-exported for convenience. */
export { art, artSrcSet, ART_WIDTHS, cdnEnabled, type ArtWidth } from './art';

export const formatPrice = (n: number | null | undefined) =>
  typeof n === 'number' ? `$${n.toFixed(2)}` : '—';

export const formatPower = (n: number | null | undefined) =>
  typeof n === 'number' ? n.toLocaleString('en-US') : '—';
