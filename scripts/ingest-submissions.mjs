#!/usr/bin/env node
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

const URL_BASE = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(
  /\/+$/,
  ''
);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const log = (...m) => console.log('[submissions]', ...m);

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
    submissions = submissions.filter((s) => s.status === undefined || s.status === 'approved');
  } else {
    submissions = await fromSupabase();
  }

  const decks = submissions.flatMap((submission) => toDecks(submission, cardsById));

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
