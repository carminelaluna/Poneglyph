#!/usr/bin/env node
/**
 * Poneglyph — tournament and decklist ingest.
 *
 *   node scripts/ingest-decks.mjs [--max 400] [--since 2026-01-01] [--reset]
 *   node scripts/ingest-decks.mjs --rebuild    # re-derive from stored decks, no network
 *
 * Pulls tournament standings from the Limitless API, resolves every card in every
 * decklist against our own archive, and derives the archetype metagame from the
 * result.
 *
 * Limitless advertises 50 requests per 5 minutes in its response headers, and there
 * are thousands of One Piece tournaments on record, so a full backfill cannot happen
 * in one run. This ingest is therefore **incremental and resumable**: it keeps a
 * state file of tournaments it has already read, spends a fixed request budget per
 * run, and picks up where it left off next time. Run it on a schedule and the
 * archive fills in on its own.
 *
 * Writes data/tournaments.json, data/decks.json, data/archetypes.json,
 * data/card-play.json, data/decks-meta.json and public/data/decks-index.json.
 */

import { writeFile, readFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { DECK_SOURCES } from './sources.mjs';
import { Budget, apiGet } from './limitless.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const SRC = DECK_SOURCES.limitless;
const DATA = path.resolve('data');
const STATE_FILE = path.join(DATA, 'decks-state.json');

/** Requests this run may spend. Keeps a scheduled run bounded and predictable. */
const BUDGET = Number(flag('max', 400));
/** Ignore tournaments before this date — old formats distort the current metagame. */
const SINCE = flag('since', null);
/** A tournament this small is a locals night, not a signal. */
const MIN_PLAYERS = Number(flag('min-players', 8));

const log = (...m) => console.log('[decks]', ...m);

// ---------------------------------------------------------------------------
// the shared Limitless client
// ---------------------------------------------------------------------------

/*
 * `Budget` and the request helper moved to scripts/limitless.mjs when the matchup
 * ingest needed them too. Two copies would have meant two rate limiters against one
 * server, each unaware of the other's requests.
 */
const budget = new Budget(BUDGET, log);
const api = (url, options = {}) =>
  apiGet(url, budget, { agent: 'poneglyph-decks/1.0 (+https://poneglyph.gg)', ...options });

// ---------------------------------------------------------------------------
// card resolution
// ---------------------------------------------------------------------------

/**
 * Limitless reports cards as `{set: "OP17", number: "039"}`. Our archive keys on
 * `OP17-039`. Most pairs join directly; the fallbacks below cover promos and the
 * handful of sets whose numbering is written differently at each end.
 */
function makeResolver(cards) {
  const byId = new Map(cards.map((c) => [c.id.toUpperCase(), c]));
  const byNameAndNumber = new Map();
  for (const c of cards) {
    byNameAndNumber.set(`${c.name.toLowerCase()}|${c.id.split('-')[1]}`, c);
  }

  return function resolve(entry) {
    const set = String(entry.set ?? '').toUpperCase().trim();
    const number = String(entry.number ?? '').trim();

    const candidates = [
      `${set}-${number}`,
      `${set}-${number.padStart(3, '0')}`,
      // Promos are `P-001` upstream and here, but some feeds send `PRB01-001`.
      `${set.replace(/^PROMO$/, 'P')}-${number.padStart(3, '0')}`,
    ];
    for (const id of candidates) {
      const hit = byId.get(id);
      if (hit) return hit;
    }
    // Last resort: the printed name plus the collector number is unique in practice.
    if (entry.name) {
      const hit = byNameAndNumber.get(`${entry.name.toLowerCase()}|${number.padStart(3, '0')}`);
      if (hit) return hit;
    }
    return null;
  };
}

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

async function loadJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * The state file holds only which tournaments have been read. Everything it could
 * otherwise cache already exists in decks.json and tournaments.json, and keeping a
 * second copy meant committing four redundant megabytes on every refresh.
 */
async function loadState() {
  if (has('reset')) return { seen: {}, details: {} };
  const state = await loadJson(STATE_FILE, null);
  /* `details` must survive a rebuild: it is the only copy of each event's venue,
     and dropping it silently reclassified every tournament as "unknown". */
  return { seen: state?.seen ?? {}, details: state?.details ?? {} };
}

/** Decks and tournaments collected by previous runs, read back from their outputs. */
async function loadCollected() {
  const [tournaments, decks] = await Promise.all([
    loadJson(path.join(DATA, 'tournaments.json'), []),
    loadJson(path.join(DATA, 'decks.json'), []),
  ]);
  if (has('reset')) return { tournaments: [], decks: [] };
  return { tournaments, decks };
}

// ---------------------------------------------------------------------------
// stage 1 — discover tournaments
// ---------------------------------------------------------------------------

async function discoverTournaments(state) {
  log('stage 1/3  discovering tournaments...');
  const found = [];
  let page = 1;

  while (!budget.exhausted) {
    const batch = await api(SRC.tournamentsUrl(page), { optional: true });
    if (!Array.isArray(batch) || batch.length === 0) break;

    for (const t of batch) {
      if (t.players < MIN_PLAYERS) continue;
      if (SINCE && t.date < SINCE) continue;
      found.push({
        id: t.id,
        name: t.name,
        date: t.date,
        players: t.players,
        format: t.format ?? null,
        organizerId: t.organizerId ?? null,
      });
    }

    // Older pages are all in the past; once every tournament on a page is both
    // already seen and older than the cutoff there is nothing new further back.
    const allSeen = batch.every((t) => state.seen[t.id]);
    const pastCutoff = SINCE && batch.every((t) => t.date < SINCE);
    if (pastCutoff) break;
    if (allSeen && page > 1) {
      log(`  page ${page} fully seen — stopping discovery`);
      break;
    }

    page++;
    if (page > 200) break; // hard stop
  }

  const fresh = found.filter((t) => !state.seen[t.id]);
  log(`  ${found.length} eligible tournaments, ${fresh.length} not yet read`);
  return { found, fresh };
}

// ---------------------------------------------------------------------------
// stage 2 — read standings and build decks
// ---------------------------------------------------------------------------

const CATEGORY_KEYS = ['character', 'event', 'stage'];

/**
 * A deck may hold at most 4 copies of a card number — except for the handful that
 * say otherwise on the card itself ("Under the rules of this game, you may have any
 * number of this card in your deck"), which are legitimately run 10 or 20 deep.
 */
function findUnlimited(cards) {
  return new Set(
    cards
      .filter((c) => /any number of this card/i.test(c.effect ?? ''))
      .map((c) => c.id)
  );
}

/** True when every entry respects the copy limit for its card. */
function countsAreLegal(entries, unlimited) {
  return entries.every((e) => e.count <= 4 || unlimited.has(e.id));
}

/**
 * A decklist can name the same card twice when a player registered copies across
 * different printings — four Prisoner of Impel Down might arrive as 3 + 1. They are
 * one card as far as the rules and the metagame are concerned, so the entries are
 * summed. Left unmerged they double-count the deck and push inclusion past 100%.
 */
function mergeEntries(cards) {
  const merged = new Map();
  for (const card of cards) {
    const existing = merged.get(card.id);
    if (existing) existing.count += card.count;
    else merged.set(card.id, { ...card });
  }
  return [...merged.values()];
}

function buildDecks(tournament, standings, resolve, stats, unlimited) {
  const decks = [];

  for (const row of standings) {
    const list = row.decklist;
    if (!list?.leader) continue;

    const leaderCard = resolve(list.leader);
    if (!leaderCard) {
      stats.unresolvedLeaders++;
      continue;
    }

    const cards = [];
    const unresolved = [];
    let total = 0;

    for (const key of CATEGORY_KEYS) {
      for (const entry of list[key] ?? []) {
        const count = Number(entry.count) || 0;
        if (!count) continue;
        total += count;
        const card = resolve(entry);
        if (!card) {
          unresolved.push({ set: entry.set, number: entry.number, name: entry.name, count });
          stats.unresolvedCards++;
          continue;
        }
        cards.push({ id: card.id, count, category: card.category });
      }
    }

    // A legal deck is exactly 50 cards plus the leader. Anything else is a
    // partial or misreported list and would skew inclusion rates.
    if (total !== 50) {
      stats.wrongSize++;
      continue;
    }

    const unique = mergeEntries(cards);

    // A misregistered list is not evidence about the metagame — drop it rather
    // than let it skew inclusion rates.
    if (!countsAreLegal(unique, unlimited)) {
      stats.illegalCounts++;
      continue;
    }

    unique.sort((a, b) => b.count - a.count || a.id.localeCompare(b.id, 'en', { numeric: true }));

    const record = row.record ?? { wins: 0, losses: 0, ties: 0 };
    decks.push({
      id: `${tournament.id}-${slug(row.player ?? row.name ?? String(decks.length))}`,
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      date: tournament.date,
      tournamentPlayers: tournament.players,
      player: row.player ?? row.name ?? 'Unknown',
      country: row.country ?? null,
      placing: row.placing ?? null,
      record,
      leaderId: leaderCard.id,
      leaderName: leaderCard.name,
      colors: leaderCard.colors,
      cards: unique,
      total,
      unresolved,
    });
  }

  return decks;
}

const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'player';

async function readStandings(fresh, resolve, state, unlimited) {
  log(`stage 2/3  reading standings (budget: ${budget.remaining} requests left)...`);
  const stats = { tournaments: 0, decks: 0, empty: 0, wrongSize: 0, illegalCounts: 0, unresolvedCards: 0, unresolvedLeaders: 0 };
  const newDecks = [];
  const newTournaments = [];

  for (const tournament of fresh) {
    if (budget.exhausted) {
      log(`  request budget spent — ${fresh.length - stats.tournaments} tournaments left for next run`);
      break;
    }

    const standings = await api(SRC.standingsUrl(tournament.id), { retries: 2, optional: true });
    state.seen[tournament.id] = { at: new Date().toISOString(), decks: 0 };
    stats.tournaments++;

    if (!Array.isArray(standings) || standings.length === 0) {
      stats.empty++;
      continue;
    }

    const decks = buildDecks(tournament, standings, resolve, stats, unlimited);
    if (decks.length === 0) {
      stats.empty++;
      continue;
    }

    state.seen[tournament.id].decks = decks.length;
    newDecks.push(...decks);
    newTournaments.push({ ...tournament, decklistCount: decks.length, source: SRC.id });
    stats.decks += decks.length;

    if (stats.tournaments % 25 === 0) {
      log(`  ${stats.tournaments} tournaments, ${stats.decks} decks, ${budget.remaining} requests left`);
    }
  }

  return { newDecks, newTournaments, stats };
}

// ---------------------------------------------------------------------------
// stage 3 — derive the metagame
// ---------------------------------------------------------------------------

/**
 * The archetype is the Leader card: in this game the Leader fixes the colours and
 * most of the deck's plan, which is exactly how players name decks ("Purple Luffy").
 */
function buildArchetypes(decks, cardsById) {
  const groups = new Map();

  for (const deck of decks) {
    if (!groups.has(deck.leaderId)) {
      groups.set(deck.leaderId, {
        leaderId: deck.leaderId,
        name: deck.leaderName,
        colors: deck.colors,
        decks: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        top8: 0,
        wins1st: 0,
        cardCounts: new Map(),
        recent: [],
      });
    }
    const a = groups.get(deck.leaderId);
    a.decks++;
    a.wins += deck.record.wins ?? 0;
    a.losses += deck.record.losses ?? 0;
    a.ties += deck.record.ties ?? 0;
    if (deck.placing !== null && deck.placing <= 8) a.top8++;
    if (deck.placing === 1) a.wins1st++;
    a.recent.push({ date: deck.date, id: deck.id });

    for (const card of deck.cards) {
      const stat = a.cardCounts.get(card.id) ?? { decks: 0, copies: 0 };
      stat.decks++;
      stat.copies += card.count;
      a.cardCounts.set(card.id, stat);
    }
  }

  const totalDecks = decks.length;

  return [...groups.values()]
    .map((a) => {
      const games = a.wins + a.losses + a.ties;
      /* The staple list: what actually defines the archetype. */
      const cards = [...a.cardCounts.entries()]
        .map(([id, stat]) => ({
          id,
          name: cardsById.get(id)?.name ?? id,
          category: cardsById.get(id)?.category ?? 'Unknown',
          inclusion: +((stat.decks / a.decks) * 100).toFixed(1),
          avgCopies: +(stat.copies / stat.decks).toFixed(2),
          decks: stat.decks,
        }))
        .sort((x, y) => y.inclusion - x.inclusion || y.avgCopies - x.avgCopies);

      return {
        leaderId: a.leaderId,
        slug: a.leaderId.toLowerCase(),
        name: a.name,
        colors: a.colors,
        decks: a.decks,
        share: +((a.decks / totalDecks) * 100).toFixed(2),
        wins: a.wins,
        losses: a.losses,
        ties: a.ties,
        winRate: games ? +((a.wins / games) * 100).toFixed(1) : null,
        top8: a.top8,
        firsts: a.wins1st,
        /* Cards in at least 60% of lists are the archetype's skeleton. */
        core: cards.filter((c) => c.inclusion >= 60),
        flex: cards.filter((c) => c.inclusion < 60 && c.inclusion >= 10),
        cards,
        lastSeen: a.recent.map((r) => r.date).sort().at(-1) ?? null,
      };
    })
    .sort((a, b) => b.decks - a.decks);
}

/** How often each card shows up across the whole field — drives the card pages. */
function buildCardPlay(decks) {
  const play = new Map();
  for (const deck of decks) {
    for (const card of deck.cards) {
      const stat = play.get(card.id) ?? { decks: 0, copies: 0, leaders: new Set() };
      stat.decks++;
      stat.copies += card.count;
      stat.leaders.add(deck.leaderId);
      play.set(card.id, stat);
    }
  }
  const total = decks.length || 1;
  return Object.fromEntries(
    [...play.entries()].map(([id, s]) => [
      id,
      {
        decks: s.decks,
        share: +((s.decks / total) * 100).toFixed(2),
        avgCopies: +(s.copies / s.decks).toFixed(2),
        archetypes: s.leaders.size,
      },
    ])
  );
}

// ---------------------------------------------------------------------------
// stage 2b — how each event was played
// ---------------------------------------------------------------------------

/**
 * Standings do not say whether an event was played on a simulator, over webcam, or
 * across a table, but `/details` does. That is one extra request per tournament, so
 * it runs as its own budgeted pass over tournaments we have not asked about yet —
 * the deck data is already useful without it, and this fills in behind.
 */
async function loadDetails(tournaments, state) {
  const missing = tournaments.filter((t) => !state.details?.[t.id]);
  if (missing.length === 0 || budget.exhausted) return 0;

  log(`stage 2b/3  event details for ${missing.length} tournaments...`);
  state.details ??= {};
  let filled = 0;

  for (const t of missing) {
    if (budget.exhausted) {
      log(`  budget spent — ${missing.length - filled} tournaments left for next run`);
      break;
    }
    const d = await api(SRC.detailsUrl(t.id), { retries: 2, optional: true });
    if (!d) continue;
    state.details[t.id] = {
      platform: d.platform ?? null,
      isOnline: d.isOnline ?? null,
      format: d.format ?? null,
    };
    filled++;
  }

  log(`  ${filled} filled`);
  return filled;
}

/**
 * What kind of event this was.
 *
 * Bandai's own circuit — Regionals, Treasure Cups, Championship Finals — is where
 * the strongest fields are, and those results deserve to be separable from a
 * Tuesday-night league. Limitless does not label any of this, so it is read out of
 * the event name, which is where organisers actually put it.
 *
 * Anything that names no tier is Local. That is the honest default: most events
 * genuinely are local, and guessing "probably a Regional because it was big" would
 * quietly promote a large online league into the same bucket as a Bandai Regional.
 *
 * Today the big tiers are nearly empty — this corpus is community online events —
 * but the classification costs nothing and fills in as official results appear.
 */
const TIERS = [
  { id: 'worlds', label: 'Worlds', test: /\bworld(s| championship)\b/i },
  { id: 'finals', label: 'Finals', test: /\b(finals?|national(s| championship)?)\b/i },
  { id: 'treasure', label: 'Treasure Cup', test: /\btreasure\s*cup\b/i },
  { id: 'regional', label: 'Regional', test: /\bregional/i },
  /* Before `championship`: a Store Championship is a store event, not a national. */
  { id: 'store', label: 'Store', test: /\b(store championship|flagship|shop (event|battle))\b/i },
  { id: 'championship', label: 'Championship', test: /\bchampionship\b/i },
  { id: 'qualifier', label: 'Qualifier', test: /\bqualifier\b/i },
];

/** Tier ids strongest first, with the default last — the order the UI offers. */
const TIER_ORDER = [...TIERS.map((t) => t.id), 'local'];
const TIER_LABELS = Object.fromEntries([
  ...TIERS.map((t) => [t.id, t.label]),
  ['local', 'Local'],
]);

function tierOf(name) {
  for (const tier of TIERS) if (tier.test.test(name ?? '')) return tier.id;
  return 'local';
}

/**
 * How an event was played, in the terms a player would use.
 *
 * `platform` is SIM for simulator play and CAM for webcam; an event with neither
 * and `isOnline: false` was played in person. Anything we have not asked about yet
 * is "unknown" rather than being guessed at.
 */
function venueOf(details) {
  if (!details) return 'unknown';
  if (details.platform === 'SIM') return 'simulator';
  if (details.platform === 'CAM') return 'webcam';
  if (details.isOnline === true) return 'online';
  if (details.isOnline === false) return 'offline';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// format eras
// ---------------------------------------------------------------------------

/**
 * When each set actually entered competitive play, derived from the corpus rather
 * than from a printed release date.
 *
 * Two things have to be true before a date can be claimed, because either alone
 * gives nonsense:
 *
 *  1. The set's first appearance is later than the corpus starts. Otherwise all we
 *     have measured is the edge of our own data — ST-01 shipped in 2022, so a
 *     "first seen" inside a 2026 corpus says nothing about its release.
 *  2. The set reaches real adoption. A single stray card from an old set turning
 *     up mid-corpus is not a release; a genuine one goes from nothing to a large
 *     share of decks within days. OP-17 peaks at 92% of decks, while the sets that
 *     merely trickle in never pass 2%.
 *  3. Several distinct cards from the set arrive, not one. This is what separates a
 *     release from a single card becoming fashionable: ST-01 shipped in 2022, but
 *     exactly one of its cards (ST01-011) entered play mid-corpus and reached 17%
 *     of decks. One card is a deckbuilding trend; a release brings a whole sheet.
 *
 * The date reported is the first appearance, not the paper release: OP-17 released
 * on 2026-08-28 in English but was being played on simulators from 2026-08-17, and
 * for a metagame tool the second date is the one that matters.
 */
const ADOPTION_THRESHOLD = 10;
const ADOPTION_WINDOW_DAYS = 7;
const MIN_DISTINCT_CARDS = 3;

function buildEras(decks) {
  if (decks.length < 100) return [];

  const rows = decks
    .map((d) => {
      const ids = [d.leaderId, ...d.cards.map((c) => c.id)];
      return {
        day: d.date.slice(0, 10),
        ids,
        sets: new Set(ids.map((id) => id.split('-')[0])),
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day));

  const corpusStart = rows[0].day;

  const firstSeen = new Map();
  const distinctCards = new Map();
  for (const row of rows) {
    for (const set of row.sets) if (!firstSeen.has(set)) firstSeen.set(set, row.day);
    for (const id of row.ids) {
      const set = id.split('-')[0];
      if (!distinctCards.has(set)) distinctCards.set(set, new Set());
      distinctCards.get(set).add(id);
    }
  }

  /*
   * Deck counts per day, and per (set, day). Bucketing once turns the adoption
   * scan from a filter over every deck for every set and every day into a slide
   * over a few hundred days — it was the slowest part of a rebuild by far.
   */
  const days = [...new Set(rows.map((r) => r.day))].sort();
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const dayMs = days.map((d) => Date.parse(`${d}T00:00:00Z`));
  const totalByDay = new Array(days.length).fill(0);
  const hitsBySet = new Map();

  for (const row of rows) {
    const i = dayIndex.get(row.day);
    totalByDay[i]++;
    for (const set of row.sets) {
      let hits = hitsBySet.get(set);
      if (!hits) {
        hits = new Array(days.length).fill(0);
        hitsBySet.set(set, hits);
      }
      hits[i]++;
    }
  }

  /** Highest share of decks holding the set across any 7-day stretch. */
  const peakAdoption = (set) => {
    const hits = hitsBySet.get(set);
    if (!hits) return 0;
    let peak = 0;
    for (let start = 0; start < days.length; start++) {
      const cutoff = dayMs[start] + ADOPTION_WINDOW_DAYS * 86_400_000;
      let total = 0;
      let hit = 0;
      for (let i = start; i < days.length && dayMs[i] < cutoff; i++) {
        total += totalByDay[i];
        hit += hits[i];
      }
      if (total < 40) continue;
      const share = (hit / total) * 100;
      if (share > peak) peak = share;
    }
    return peak;
  };

  return [...firstSeen.entries()]
    .filter(([set, day]) => /^(OP|EB|PRB|ST)\d+$/.test(set) && day > corpusStart)
    .filter(([set]) => (distinctCards.get(set)?.size ?? 0) >= MIN_DISTINCT_CARDS)
    .map(([set, day]) => ({ set, day, peak: peakAdoption(set), cards: distinctCards.get(set).size }))
    .filter((e) => e.peak >= ADOPTION_THRESHOLD)
    .map(({ set, day, peak, cards }) => ({
      // `OP17` -> `OP-17`, matching how sets are labelled everywhere else.
      code: set.replace(/^([A-Z]+)(\d+)$/, '$1-$2'),
      set,
      from: day,
      kind: set.startsWith('ST') ? 'Starter deck' : 'Expansion',
      peak: +peak.toFixed(1),
      cards,
    }))
    .reduce(groupSameDay, [])
    .map((era) => ({
      ...era,
      decks: decks.filter((d) => d.date.slice(0, 10) >= era.from).length,
    }))
    .sort((a, b) => b.from.localeCompare(a.from));
}

/**
 * Starter decks ship in waves — ST-31, ST-32 and ST-34 all entered play on the same
 * day. Three identical dates in a dropdown are three ways to ask one question, so
 * releases sharing a date become a single window.
 */
function groupSameDay(eras, era) {
  const existing = eras.find((e) => e.from === era.from && e.kind === era.kind);
  if (!existing) return [...eras, { ...era, codes: [era.code] }];
  existing.codes.push(era.code);
  existing.code = existing.codes.join(', ');
  existing.cards += era.cards;
  existing.peak = Math.max(existing.peak, era.peak);
  return eras;
}

// ---------------------------------------------------------------------------
// browser index
// ---------------------------------------------------------------------------

/**
 * The metagame is recomputed in the page for whatever window the reader picks, so
 * the deck corpus ships to the browser — but in two pieces.
 *
 * The table needs only a light row per deck (leader, date, placing, record). The
 * card lists are five times heavier and are needed by exactly one view, the
 * archetype page, and only for one archetype at a time. Shipping them together
 * cost every visitor ~400 KB gzipped; split, the table costs ~130 KB and an
 * archetype page adds 6-15 KB of its own.
 */
async function writeBrowserIndex(decks, cardsById, eras, meta, venueById = new Map(), tierById = new Map()) {
  const dir = path.resolve('public', 'data');
  const deckDir = path.join(dir, 'decks');
  await mkdir(deckDir, { recursive: true });

  const leaders = {};
  const cardNames = {};
  const byLeader = new Map();

  for (const deck of decks) {
    if (!leaders[deck.leaderId]) {
      leaders[deck.leaderId] = { n: deck.leaderName, c: deck.colors };
    }
    for (const card of deck.cards) {
      if (!cardNames[card.id]) {
        const info = cardsById.get(card.id);
        cardNames[card.id] = [info?.name ?? card.id, card.category];
      }
    }
    if (!byLeader.has(deck.leaderId)) byLeader.set(deck.leaderId, {});
    byLeader.get(deck.leaderId)[deck.id] = deck.cards.map((c) => [c.id, c.count]);
  }

  const index = {
    generatedAt: meta.generatedAt,
    window: {
      from: meta.coverage.oldest?.slice(0, 10) ?? null,
      to: meta.coverage.newest?.slice(0, 10) ?? null,
    },
    /* Full Swiss fields: all but one of these decks carries a win-loss record. */
    sampling: 'field',
    eras,
    tiers: TIER_ORDER.map((id) => ({ id, label: TIER_LABELS[id] })),
    leaders,
    cards: cardNames,
    decks: decks.map((d) => ({
      i: d.id,
      l: d.leaderId,
      d: d.date.slice(0, 10),
      p: d.placing,
      w: d.record.wins ?? 0,
      s: d.record.losses ?? 0,
      t: d.record.ties ?? 0,
      n: d.tournamentPlayers,
      e: d.tournamentName,
      v: venueById.get(d.tournamentId) ?? 'unknown',
      k: tierById.get(d.tournamentId) ?? 'local',
    })),
  };

  const json = JSON.stringify(index);
  await writeFile(path.join(dir, 'decks-index.json'), json);

  /* Stale archetype files would silently serve last week's lists. */
  const existing = await readdir(deckDir).catch(() => []);
  const wanted = new Set([...byLeader.keys()].map((id) => `${id}.json`));
  await Promise.all(
    existing.filter((f) => f.endsWith('.json') && !wanted.has(f)).map((f) => rm(path.join(deckDir, f)))
  );

  await Promise.all(
    [...byLeader.entries()].map(([leaderId, lists]) =>
      writeFile(path.join(deckDir, `${leaderId}.json`), JSON.stringify(lists))
    )
  );

  const kb = (Buffer.byteLength(json) / 1024).toFixed(0);
  log(`browser index -> public/data/decks-index.json (${kb} KB, ${eras.length} eras)`);
  log(`card lists    -> public/data/decks/*.json (${byLeader.size} archetypes)`);
}

// ---------------------------------------------------------------------------

async function main() {
  const started = Date.now();

  const cards = await loadJson(path.join(DATA, 'cards.json'), null);
  if (!cards) {
    console.error('[decks] data/cards.json is missing — run `npm run ingest` first');
    process.exit(1);
  }
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const resolve = makeResolver(cards);
  const unlimited = findUnlimited(cards);

  const state = await loadState();
  const collected = await loadCollected();
  const rebuildOnly = has('rebuild');

  if (rebuildOnly) {
    log(`rebuilding derived data from ${collected.decks.length} stored decks (no network)`);
  } else {
    log(`${Object.keys(state.seen).length} tournaments already read, budget ${BUDGET} requests`);
  }

  const { fresh } = rebuildOnly ? { fresh: [] } : await discoverTournaments(state);
  const { newDecks, newTournaments, stats } = rebuildOnly
    ? { newDecks: [], newTournaments: [], stats: { tournaments: 0, decks: 0, empty: 0, wrongSize: 0, illegalCounts: 0, unresolvedCards: 0, unresolvedLeaders: 0 } }
    : await readStandings(fresh, resolve, state, unlimited);

  /* Merge with what previous runs collected. */
  const merged = dedupe([...collected.tournaments, ...newTournaments], (t) => t.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!rebuildOnly) await loadDetails(merged, state);

  const tournaments = merged.map((t) => {
    const details = state.details?.[t.id] ?? null;
    return {
      ...t,
      venue: venueOf(details),
      platform: details?.platform ?? null,
      tier: tierOf(t.name),
    };
  });
  const venueById = new Map(tournaments.map((t) => [t.id, t.venue]));
  const tierById = new Map(tournaments.map((t) => [t.id, t.tier]));
  const decks = dedupe([...collected.decks, ...newDecks], (d) => d.id)
    .map((d) => (d.cards.length === new Set(d.cards.map((c) => c.id)).size
      ? d
      : { ...d, cards: mergeEntries(d.cards) }))
    .filter((d) => countsAreLegal(d.cards, unlimited))
    .sort((a, b) => b.date.localeCompare(a.date) || (a.placing ?? 999) - (b.placing ?? 999));

  const archetypes = buildArchetypes(decks, cardsById);
  const cardPlay = buildCardPlay(decks);
  const eras = buildEras(decks);

  const meta = {
    generatedAt: new Date().toISOString(),
    source: { id: SRC.id, label: SRC.label, home: SRC.home, docs: SRC.docs },
    counts: {
      tournaments: tournaments.length,
      decks: decks.length,
      archetypes: archetypes.length,
      cardsPlayed: Object.keys(cardPlay).length,
    },
    thisRun: { ...stats, requests: budget.spent },
    coverage: {
      tournamentsRead: Object.keys(state.seen).length,
      oldest: tournaments.at(-1)?.date ?? null,
      newest: tournaments[0]?.date ?? null,
    },
    filters: { minPlayers: MIN_PLAYERS, since: SINCE },
    venues: tournaments.reduce((tally, t) => {
      tally[t.venue] = (tally[t.venue] ?? 0) + 1;
      return tally;
    }, {}),
    tiers: tournaments.reduce((tally, t) => {
      tally[t.tier] = (tally[t.tier] ?? 0) + 1;
      return tally;
    }, {}),
    eras,
    durationMs: Date.now() - started,
  };

  await mkdir(DATA, { recursive: true });
  await Promise.all([
    writeFile(STATE_FILE, JSON.stringify(state)),
    writeFile(path.join(DATA, 'tournaments.json'), JSON.stringify(tournaments)),
    writeFile(path.join(DATA, 'decks.json'), JSON.stringify(decks)),
    writeFile(path.join(DATA, 'archetypes.json'), JSON.stringify(archetypes)),
    writeFile(path.join(DATA, 'card-play.json'), JSON.stringify(cardPlay)),
    writeFile(path.join(DATA, 'decks-meta.json'), JSON.stringify(meta, null, 2)),
  ]);
  await writeBrowserIndex(decks, cardsById, eras, meta, venueById, tierById);

  log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s using ${budget.spent} requests`);
  console.table(meta.counts);
  console.table(meta.thisRun);
  if (stats.unresolvedCards) {
    log(`${stats.unresolvedCards} card references could not be matched to the archive`);
  }
  const left = fresh.length - stats.tournaments;
  if (left > 0) log(`${left} tournaments still unread — run again to continue the backfill`);
}

function dedupe(items, key) {
  const map = new Map();
  for (const item of items) map.set(key(item), item);
  return [...map.values()];
}

main().catch((err) => {
  console.error('[decks] FAILED —', err.message);
  process.exit(1);
});
