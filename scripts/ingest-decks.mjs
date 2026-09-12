#!/usr/bin/env node
import { writeFile, readFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { DECK_SOURCES } from './sources.mjs';
import { Budget, apiGet } from './limitless.mjs';
import { readDecks, writeDecks } from './deck-corpus.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const SRC = DECK_SOURCES.limitless;
const DATA = path.resolve('data');
const STATE_FILE = path.join(DATA, 'decks-state.json');

const BUDGET = Number(flag('max', 400));
const SINCE = flag('since', null);
const MIN_PLAYERS = Number(flag('min-players', 8));
const BACKFILL = has('backfill');

const log = (...m) => console.log('[decks]', ...m);

const budget = new Budget(BUDGET, log);
const api = (url, options = {}) =>
  apiGet(url, budget, { agent: 'poneglyph-decks/1.0 (+https://poneglyph.gg)', ...options });

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
      `${set.replace(/^PROMO$/, 'P')}-${number.padStart(3, '0')}`,
    ];
    for (const id of candidates) {
      const hit = byId.get(id);
      if (hit) return hit;
    }
    if (entry.name) {
      const hit = byNameAndNumber.get(`${entry.name.toLowerCase()}|${number.padStart(3, '0')}`);
      if (hit) return hit;
    }
    return null;
  };
}

async function loadJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function loadState() {
  if (has('reset')) return { seen: {}, details: {} };
  const state = await loadJson(STATE_FILE, null);
  return { seen: state?.seen ?? {}, details: state?.details ?? {} };
}

async function loadCollected() {
  const [tournaments, decks] = await Promise.all([
    loadJson(path.join(DATA, 'tournaments.json'), []),
    readDecks(DATA),
  ]);
  if (has('reset')) return { tournaments: [], decks: [] };
  return { tournaments, decks };
}

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

    const allSeen = batch.every((t) => state.seen[t.id]);
    const pastCutoff = SINCE && batch.every((t) => t.date < SINCE);
    if (pastCutoff) break;
    if (allSeen && page > 1 && !BACKFILL) {
      log(`  page ${page} fully seen — stopping discovery`);
      break;
    }

    page++;
    if (page > 200) break;
  }

  const fresh = found.filter((t) => !state.seen[t.id]);
  log(`  ${found.length} eligible tournaments, ${fresh.length} not yet read`);
  return { found, fresh };
}

const CATEGORY_KEYS = ['character', 'event', 'stage'];

function findUnlimited(cards) {
  return new Set(
    cards
      .filter((c) => /any number of this card/i.test(c.effect ?? ''))
      .map((c) => c.id)
  );
}

function countsAreLegal(entries, unlimited) {
  return entries.every((e) => e.count <= 4 || unlimited.has(e.id));
}

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

    if (total !== 50) {
      stats.wrongSize++;
      continue;
    }

    const unique = mergeEntries(cards);

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
        core: cards.filter((c) => c.inclusion >= 60),
        flex: cards.filter((c) => c.inclusion < 60 && c.inclusion >= 10),
        cards,
        lastSeen: a.recent.map((r) => r.date).sort().at(-1) ?? null,
      };
    })
    .sort((a, b) => b.decks - a.decks);
}

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

const TIERS = [
  { id: 'worlds', label: 'Worlds', test: /\bworld(s| championship)\b/i },
  { id: 'finals', label: 'Finals', test: /\b(finals?|national(s| championship)?)\b/i },
  { id: 'treasure', label: 'Treasure Cup', test: /\btreasure\s*cup\b/i },
  { id: 'regional', label: 'Regional', test: /\bregional/i },
  { id: 'store', label: 'Store', test: /\b(store championship|flagship|shop (event|battle))\b/i },
  { id: 'championship', label: 'Championship', test: /\bchampionship\b/i },
  { id: 'qualifier', label: 'Qualifier', test: /\bqualifier\b/i },
];

const TIER_ORDER = [...TIERS.map((t) => t.id), 'local'];
const TIER_LABELS = Object.fromEntries([
  ...TIERS.map((t) => [t.id, t.label]),
  ['local', 'Local'],
]);

function tierOf(name) {
  for (const tier of TIERS) if (tier.test.test(name ?? '')) return tier.id;
  return 'local';
}

function venueOf(details) {
  if (!details) return 'unknown';
  if (details.platform === 'SIM') return 'simulator';
  if (details.platform === 'CAM') return 'webcam';
  if (details.isOnline === true) return 'online';
  if (details.isOnline === false) return 'offline';
  return 'unknown';
}

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
  const decks = dedupe([...collected.decks, ...newDecks], (d) => d.id)
    .map((d) => (d.cards.length === new Set(d.cards.map((c) => c.id)).size
      ? d
      : { ...d, cards: mergeEntries(d.cards) }))
    .filter((d) => countsAreLegal(d.cards, unlimited))
    .sort((a, b) => b.date.localeCompare(a.date) || (a.placing ?? 999) - (b.placing ?? 999));

  const archetypes = buildArchetypes(decks, cardsById);
  const cardPlay = buildCardPlay(decks);

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
    durationMs: Date.now() - started,
  };

  await mkdir(DATA, { recursive: true });
  await Promise.all([
    writeFile(STATE_FILE, JSON.stringify(state)),
    writeFile(path.join(DATA, 'tournaments.json'), JSON.stringify(tournaments)),
    writeFile(path.join(DATA, 'archetypes.json'), JSON.stringify(archetypes)),
    writeFile(path.join(DATA, 'card-play.json'), JSON.stringify(cardPlay)),
    writeFile(path.join(DATA, 'decks-meta.json'), JSON.stringify(meta, null, 2)),
  ]);

  const years = await writeDecks(DATA, decks);
  log(`decks -> ${years.map((y) => `${y.year}:${y.decks}`).join(' ')}`);

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
