#!/usr/bin/env node
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DECK_SOURCES } from './sources.mjs';
import { Budget, apiGet } from './limitless.mjs';
import { toRows } from './matchups.mjs';
import { readDecks } from './deck-corpus.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const SRC = DECK_SOURCES.limitless;
const DATA = path.resolve('data');
const OUT = path.join(DATA, 'matchups.json');

const BUDGET = Number(flag('max', 200));
const log = (...m) => console.log('[matchups]', ...m);

const read = async (file, fallback) => {
  try {
    return JSON.parse(await readFile(path.join(DATA, file), 'utf8'));
  } catch {
    return fallback;
  }
};

async function main() {
  const started = Date.now();

  const tournaments = await read('tournaments.json', []);
  const decks = await readDecks(DATA);

  if (tournaments.length === 0 || decks.length === 0) {
    console.error('[matchups] no tournaments or decks on record — run ingest:decks first');
    process.exit(1);
  }

  const byTournament = new Map();
  for (const deck of decks) {
    if (!deck.tournamentId || !deck.player || !deck.leaderId) continue;
    let held = byTournament.get(deck.tournamentId);
    if (!held) byTournament.set(deck.tournamentId, (held = new Map()));
    held.set(String(deck.player).toLowerCase(), deck.leaderId);
  }

  const held = has('reset') ? null : await read('matchups.json', null);
  const seen = held?.seen ?? {};
  const days = held?.days ?? [];
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const rows = held?.rows ?? [];

  const budget = new Budget(BUDGET, log);
  const pending = tournaments
    .filter((t) => byTournament.has(t.id) && seen[t.id] === undefined)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  log(
    `${tournaments.length} tournaments on record, ${Object.keys(seen).length} already read, ` +
      `${pending.length} to go, budget ${BUDGET} requests`
  );

  let added = 0;
  let readNow = 0;
  let noPairings = 0;

  for (const tournament of pending) {
    if (budget.exhausted) {
      log(`  request budget spent — ${pending.length - readNow} tournaments left for next run`);
      break;
    }

    const pairings = await apiGet(SRC.pairingsUrl(tournament.id), budget, {
      retries: 2,
      optional: true,
      agent: 'poneglyph-matchups/1.0 (+https://poneglyph.gg)',
    });
    readNow++;

    if (!Array.isArray(pairings) || pairings.length === 0) {
      seen[tournament.id] = 0;
      noPairings++;
      continue;
    }

    const day = String(tournament.date).slice(0, 10);
    if (!dayIndex.has(day)) {
      dayIndex.set(day, days.length);
      days.push(day);
    }
    const at = dayIndex.get(day);

    const { rows: found } = toRows(pairings, byTournament.get(tournament.id));
    for (const [a, b, result] of found) rows.push([at, a, b, result]);

    seen[tournament.id] = found.length;
    added += found.length;

    if (readNow % 25 === 0) {
      log(`  ${readNow} read, ${added} matches, ${budget.remaining} requests left`);
    }
  }

  if (rows.length === 0) {
    console.error('[matchups] no matches resolved — leaving any existing file untouched');
    process.exit(readNow === 0 ? 0 : 1);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    source: { id: 'limitless', label: SRC.label, home: SRC.home },
    counts: {
      tournaments: Object.keys(seen).length,
      pending: Math.max(0, pending.length - readNow),
      matches: rows.length,
      withoutPairings: Object.values(seen).filter((n) => n === 0).length,
    },
    thisRun: { tournaments: readNow, matches: added, noPairings, requests: budget.spent },
    days,
    seen,
    rows,
  };

  await mkdir(DATA, { recursive: true });
  await writeFile(OUT, JSON.stringify(payload));

  log(
    `${rows.length.toLocaleString('en-US')} matches across ` +
      `${payload.counts.tournaments} tournaments (+${added} this run, ${budget.spent} requests)`
  );
  if (payload.counts.pending) log(`${payload.counts.pending} tournaments left for the next run`);
  log('run build-indexes.mjs to fold these into the site');
}

main().catch((err) => {
  console.error('[matchups] FAILED —', err.message);
  process.exit(1);
});
