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
import { toDecks } from './submissions.mjs';

const DATA = path.resolve('data');

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? null : args[at + 1];
};

const FIXTURE = flag('fixture');

/*
 * The project URL is not a secret — it is compiled into the browser bundle under
 * its NEXT_PUBLIC_ name and readable by anyone who opens the site — so it is read
 * from either name. That is not tidiness: the workflow set `SUPABASE_URL` from a
 * repository secret that had never been created, so this ingest exited 1 on every
 * run behind `continue-on-error`, and an approved submission would have sat in the
 * database for ever without one line of red anywhere.
 *
 * The **service role key** is a real secret and has no fallback. It bypasses every
 * row-level policy, so there is no name it could safely be read from that also
 * reaches the browser.
 */
const URL_BASE = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(
  /\/+$/,
  ''
);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const log = (...m) => console.log('[submissions]', ...m);

/**
 * Nothing configured at all — a checkout with no Supabase project behind it.
 *
 * That is a real answer rather than a failure, and it is the same answer the site
 * gives: `accountsEnabled` is false, the account page says so, and everything else
 * works. Half-configured is a different thing and is treated as one below.
 */
const CONFIGURED = Boolean(URL_BASE || KEY);

async function fromSupabase() {
  if (!URL_BASE || !KEY) {
    console.error(
      [
        '[submissions] half configured — ' +
          `${URL_BASE ? 'the project URL is set but' : 'no project URL, and'} ` +
          `the service role key is ${KEY ? 'set' : 'missing'}.`,
        '              The key belongs in the workflow secrets — never in .env.local',
        '              and never under a NEXT_PUBLIC_ name, since anything with that',
        '              prefix is compiled into the browser bundle. The URL may be read',
        '              from either SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.',
        '              To try the mapping without a database: --fixture <file>',
      ].join('\n')
    );
    process.exit(1);
  }

  /* One request, with the decks embedded, rather than one per submission. */
  const query =
    'submissions?status=eq.approved&select=' +
    encodeURIComponent(
      'id,event_name,event_date,venue,tier,region,sampling,players,organizer_id,' +
        'submission_decks(id,player,place,wins,losses,ties,leader_id,cards)'
    );

  const res = await fetch(`${URL_BASE}/rest/v1/${query}`, {
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Supabase answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const submissions = await res.json();
  return withOrganizers(submissions);
}

/**
 * The display name behind each `organizer_id`, in one more request.
 *
 * It is a second request rather than an embed because `submissions.organizer_id`
 * references `auth.users`, not `public.profiles` — there is no foreign key between
 * those two tables for PostgREST to follow, so `select=…,profiles(display_name)`
 * has nothing to join on and answers with an error rather than a name.
 *
 * A failure here is not a failure of the ingest. The names are attribution on the
 * event page; the results are the point, and an event that says who ran it is
 * better than no event. So this warns and returns the submissions unchanged.
 */
async function withOrganizers(submissions) {
  const ids = [...new Set(submissions.map((s) => s.organizer_id).filter(Boolean))];
  if (ids.length === 0) return submissions;

  try {
    const query = `profiles?id=in.(${ids.join(',')})&select=id,display_name`;
    const res = await fetch(`${URL_BASE}/rest/v1/${query}`, {
      headers: { apikey: KEY, authorization: `Bearer ${KEY}`, accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Supabase answered ${res.status}`);
    const names = new Map((await res.json()).map((p) => [p.id, p.display_name]));
    return submissions.map((s) => ({ ...s, organizer: names.get(s.organizer_id) ?? null }));
  } catch (err) {
    console.log(`::warning::could not read organizer names: ${err.message}`);
    return submissions;
  }
}

async function main() {
  const started = Date.now();

  /*
   * A checkout with no project behind it stops here, having written nothing and
   * failed nothing. Any *existing* decks-community.json is left alone: it was
   * committed by a run that could read the database, and deleting it because this
   * machine has no key would drop approved results from the site.
   */
  if (!FIXTURE && !CONFIGURED) {
    log('no Supabase project configured — skipping (the site builds without one)');
    return;
  }

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
