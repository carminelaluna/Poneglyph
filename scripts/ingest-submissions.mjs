#!/usr/bin/env node
/**
 * Poneglyph — tournament submissions from organizers.
 *
 *   node scripts/ingest-submissions.mjs
 *   node scripts/ingest-submissions.mjs --fixture path/to/sample.json
 *
 * Reads **approved** submissions out of Supabase and writes them into the corpus as
 * a third source, next to Limitless and Top Decks.
 *
 * Approved, and nothing else. Every share and win rate on this site is derived from
 * recorded results, so an account that could put a tournament straight into them
 * could put anything into them. The gate is the `status` column, checked here rather
 * than trusted from the client — see supabase/schema.sql for why the role that sets
 * it is granted by hand.
 *
 * **Sampling travels with the deck.** An organizer says whether they are uploading a
 * whole Swiss field or only the decks that placed, and that answer is recorded per
 * deck exactly as it is for the other two sources. Counting a winners-only event as
 * a field produces a win rate near 100% that means nothing.
 *
 * The service role key bypasses every row-level policy, which is why it belongs in
 * the workflow secrets and nowhere near the browser bundle.
 *
 * Writes data/decks-community.json. Run build-indexes.mjs afterwards.
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const DATA = path.resolve('data');

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? null : args[at + 1];
};

const FIXTURE = flag('fixture');
const URL_BASE = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const log = (...m) => console.log('[submissions]', ...m);

/** `2026-08-26` from whatever shape the column comes back in. */
const day = (value) => String(value ?? '').slice(0, 10);

/** Missing values are named, not blanked — the same rule the other ingests follow. */
const UNKNOWN_PLAYER = 'Not recorded';
const UNKNOWN_EVENT = 'Event not recorded';
const named = (value, fallback) => {
  const text = String(value ?? '').trim();
  return text && !/^(na|n\/a|unknown|none|null)$/i.test(text) ? text : fallback;
};

async function fromSupabase() {
  if (!URL_BASE || !KEY) {
    console.error(
      '[submissions] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set.\n' +
        '              The service role key belongs in the workflow secrets — never in\n' +
        '              .env.local and never under a NEXT_PUBLIC_ name, since anything\n' +
        '              with that prefix is compiled into the browser bundle.\n' +
        '              To try the mapping without a database: --fixture <file>'
    );
    process.exit(1);
  }

  /* One request, with the decks embedded, rather than one per submission. */
  const query =
    'submissions?status=eq.approved&select=' +
    encodeURIComponent(
      'id,event_name,event_date,venue,tier,region,sampling,players,' +
        'submission_decks(id,player,place,wins,losses,ties,leader_id,cards)'
    );

  const res = await fetch(`${URL_BASE}/rest/v1/${query}`, {
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Supabase answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

/**
 * One submission becomes one event's worth of decks, in the shape the corpus uses.
 *
 * Card names and colours are deliberately absent: build-indexes.mjs resolves those
 * from the card archive, and a name copied in here would be a second copy to go
 * stale when a card is errata'd.
 */
function toDecks(submission, cardsById) {
  const rows = submission.submission_decks ?? [];
  const date = day(submission.event_date);
  const eventName = named(submission.event_name, UNKNOWN_EVENT);

  return rows.map((row, index) => {
    const leader = cardsById.get(row.leader_id);
    return {
      /* Stable across runs: the same submission re-ingested keeps its deck ids. */
      id: `c-${submission.id}-${row.id ?? index}`,
      tournamentId: `c-${submission.id}`,
      date,
      leaderId: row.leader_id,
      leaderName: leader?.name ?? row.leader_id,
      colors: leader?.colors ?? [],
      /*
       * The column is `place`, the corpus field is `placing`. PLACING is a reserved
       * word in PostgreSQL, so it cannot be a bare column name — see schema.sql.
       */
      placing: Number.isFinite(row.place) ? row.place : null,
      record: {
        wins: row.wins ?? 0,
        losses: row.losses ?? 0,
        ties: row.ties ?? 0,
      },
      players: submission.players ?? 0,
      eventName,
      player: named(row.player, UNKNOWN_PLAYER),
      venue: submission.venue || 'unknown',
      tier: submission.tier || 'local',
      cards: (row.cards ?? []).map((c) => ({ id: c.id, count: c.count })),
      /* The organizer's answer, carried per deck like every other source. */
      sampling: submission.sampling === 'field' ? 'field' : 'winners',
      region: submission.region === 'JP' ? 'JP' : 'EN',
      source: 'community',
    };
  });
}

async function main() {
  const started = Date.now();

  const cards = JSON.parse(await readFile(path.join(DATA, 'cards.json'), 'utf8'));
  const cardsById = new Map((Array.isArray(cards) ? cards : cards.cards).map((c) => [c.id, c]));

  let submissions;
  if (FIXTURE) {
    log(`reading ${FIXTURE} instead of Supabase`);
    submissions = JSON.parse(await readFile(path.resolve(FIXTURE), 'utf8'));
    /* A fixture is written by hand, so the status filter is applied here too. */
    submissions = submissions.filter((s) => s.status === undefined || s.status === 'approved');
  } else {
    submissions = await fromSupabase();
  }

  const decks = submissions.flatMap((submission) => toDecks(submission, cardsById));

  /*
   * An empty result is not a failure here, unlike the other ingests. There genuinely
   * may be no approved submissions yet, and refusing to write would leave a stale
   * file that says otherwise. What must not happen is writing an empty file because
   * a request failed — and that throws above rather than returning nothing.
   */
  const unknownLeaders = decks.filter((d) => !cardsById.has(d.leaderId));
  if (unknownLeaders.length > 0) {
    log(
      `${unknownLeaders.length} deck(s) name a Leader the archive does not have — ` +
        'kept, and they will show their card number until the archive catches up'
    );
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    source: { id: 'community', label: 'Submitted by organizers' },
    counts: {
      submissions: submissions.length,
      decks: decks.length,
      field: decks.filter((d) => d.sampling === 'field').length,
      winners: decks.filter((d) => d.sampling === 'winners').length,
    },
    decks,
  };

  await mkdir(DATA, { recursive: true });
  await writeFile(path.join(DATA, 'decks-community.json'), JSON.stringify(payload));

  log(
    `${submissions.length} approved submission(s), ${decks.length} decks ` +
      `(${payload.counts.field} field, ${payload.counts.winners} winners)`
  );
  log('run build-indexes.mjs to fold these into the site');
}

main().catch((err) => {
  console.error('[submissions] FAILED —', err.message);
  process.exit(1);
});
