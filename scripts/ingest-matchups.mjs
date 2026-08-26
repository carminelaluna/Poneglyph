#!/usr/bin/env node
/**
 * Poneglyph — archetype against archetype.
 *
 *   node scripts/ingest-matchups.mjs [--max 200] [--reset]
 *
 * Every win rate on this site until now has been a deck's record against *the
 * field* — 52.8% says it beat whatever it happened to sit across from. The question
 * people actually ask about a deck is narrower than that: how does it do against the
 * thing it will meet in the top cut.
 *
 * Limitless publishes `/tournaments/{id}/pairings` — round, table, both players and
 * the winner, by username. `data/decks.json` already records which Leader each
 * username played *at that tournament*, so joining the two gives a real Leader
 * against Leader result for every match in a recorded event. Nothing here is
 * inferred from records or reconstructed from standings.
 *
 * **Only Limitless.** One Piece Top Decks publishes finishing lists, not brackets,
 * and an organizer submitting a tournament is not asked for pairings — so this
 * covers the 9,381 decks from Limitless and says so, rather than quietly presenting
 * a partial corpus as the whole one.
 *
 * One request per tournament, resumable in exactly the way the deck ingest is: a
 * budget per run, a record of what has already been read, and a note of what is
 * left for next time.
 *
 * Writes data/matchups.json. Run build-indexes.mjs afterwards.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
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
const OUT = path.join(DATA, 'matchups.json');

const BUDGET = Number(flag('max', 200));
const log = (...m) => console.log('[matchups]', ...m);

/** 1 = the first Leader won, 0 = the second did, 2 = a draw or no result. */
const A_WON = 1;
const B_WON = 0;
const DRAW = 2;

const read = async (file, fallback) => {
  try {
    return JSON.parse(await readFile(path.join(DATA, file), 'utf8'));
  } catch {
    return fallback;
  }
};

/**
 * One tournament's pairings, as Leader-against-Leader rows.
 *
 * A match is kept only when **both** usernames have a decklist on record for that
 * tournament. Limitless publishes pairings for everyone who turned up and decklists
 * only for those who submitted one, so a partial field is normal and the missing
 * side of a match is genuinely unknown — counting it against "unknown" would invent
 * an archetype that never existed.
 */
function toRows(pairings, leaderByPlayer) {
  const rows = [];
  let unknown = 0;

  for (const pairing of pairings) {
    const a = leaderByPlayer.get(String(pairing.player1 ?? '').toLowerCase());
    const b = leaderByPlayer.get(String(pairing.player2 ?? '').toLowerCase());
    if (!a || !b) {
      unknown++;
      continue;
    }

    /* A mirror tells you nothing about either side — 50% by construction. */
    if (a === b) continue;

    const winner = String(pairing.winner ?? '').toLowerCase();
    const result =
      winner === String(pairing.player1 ?? '').toLowerCase()
        ? A_WON
        : winner === String(pairing.player2 ?? '').toLowerCase()
          ? B_WON
          : DRAW;

    rows.push([a, b, result]);
  }

  return { rows, unknown };
}

async function main() {
  const started = Date.now();

  const tournaments = await read('tournaments.json', []);
  const decksFile = await read('decks.json', []);
  const decks = Array.isArray(decksFile) ? decksFile : (decksFile.decks ?? []);

  if (tournaments.length === 0 || decks.length === 0) {
    console.error('[matchups] no tournaments or decks on record — run ingest:decks first');
    process.exit(1);
  }

  /* Username -> Leader, per tournament: the same person plays different decks. */
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
    /* Newest first: the current metagame is what a matchup table is read for. */
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
      /*
       * Recorded as read with zero matches. Without this the next run would ask
       * again, for ever, and a handful of events with no published bracket would
       * eat the budget that new tournaments need.
       */
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

  /*
   * Refuses to overwrite a real file with nothing, like every other ingest here.
   * A first run that reached no tournament should leave no file rather than an
   * empty one that later reads as "there are no matchups".
   */
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
