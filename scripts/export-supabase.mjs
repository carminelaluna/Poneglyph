#!/usr/bin/env node
/**
 * Poneglyph — a copy of everything Supabase holds.
 *
 *   node scripts/export-supabase.mjs [--out <dir>]
 *
 * It is the only data here that is not in git, and the Free plan takes no backups:
 * *"the Free tier does not receive automatic backups"* — daily ones start at Pro,
 * with seven days of retention. So accounts, saved decks, organizer requests and
 * submissions have no copy anywhere, and a deleted or corrupted project would take
 * them with it. Everything else on this site is either in the repository or can be
 * re-derived from what is.
 *
 * ## Why an artifact and not a commit
 *
 * The repository is **public**. `organizer_requests` holds text people wrote about
 * who they are and what they run, and a submission is somebody's work before it has
 * been reviewed. Committing a dump would publish both. The workflow uploads this as
 * an Actions artifact instead — private to the repository, ninety days of retention,
 * and free.
 *
 * ## What this cannot do, and it matters
 *
 * `auth.users` lives in the `auth` schema, which PostgREST does not expose, so the
 * **email addresses and the identities are not in here**. What is exported is the
 * application's own tables, keyed by user id.
 *
 * That makes this a restore of *data*, not of *accounts*. After one, a person signs
 * in again with the same provider and Supabase links them back by verified email —
 * the profile, decks and submissions are then reattached by id. Somebody who never
 * signs in again is a row pointing at a user that no longer exists. A full backup
 * needs `supabase db dump`, which needs the database password rather than the
 * service key; this is what can be automated without holding that.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` bypasses every policy, which is exactly why it reads
 * everything — and why it belongs in the workflow secrets and nowhere else.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const OUT = path.resolve(flag('out', 'backup'));
const URL_BASE = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(
  /\/+$/,
  ''
);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CONFIGURED = Boolean(URL_BASE && KEY);

const log = (...m) => console.log('[backup]', ...m);

/**
 * Every table in the `public` schema, and nothing derived.
 *
 * If one is added to `supabase/schema.sql` it has to be added here; nothing
 * enforces that, which is the same gap `sitemap.ts` has and worth the same
 * suspicion when a table is new.
 */
const TABLES = ['profiles', 'decks', 'organizer_requests', 'submissions', 'submission_decks'];

/** PostgREST caps a response; ask in pages so a growing table cannot silently truncate. */
const PAGE = 1000;

async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=*`, {
      headers: {
        apikey: KEY,
        authorization: `Bearer ${KEY}`,
        accept: 'application/json',
        range: `${from}-${from + PAGE - 1}`,
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      throw new Error(`${table}: Supabase answered ${res.status} — ${(await res.text()).slice(0, 160)}`);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function main() {
  /*
   * A checkout with no project stops here having written nothing and failed
   * nothing, the same way ingest-submissions.mjs does — the site builds without
   * a Supabase project and this script is not the place to change that.
   */
  if (!CONFIGURED) {
    log(
      'no Supabase project configured — skipping. ' +
        'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to take a copy.'
    );
    return;
  }

  await mkdir(OUT, { recursive: true });
  const taken = new Date().toISOString();
  const counts = {};

  for (const table of TABLES) {
    const rows = await fetchAll(table);
    counts[table] = rows.length;
    await writeFile(
      path.join(OUT, `${table}.json`),
      JSON.stringify({ table, takenAt: taken, rows }, null, 2)
    );
    log(`${table}: ${rows.length} row(s)`);
  }

  /*
   * A manifest, so a dump found in six months says what it is, when it was taken
   * and — the part a restorer needs most — what it does not contain.
   */
  await writeFile(
    path.join(OUT, 'manifest.json'),
    JSON.stringify(
      {
        takenAt: taken,
        project: URL_BASE,
        tables: counts,
        excludes: [
          'auth.users — not exposed by PostgREST, so email addresses and identities are not here',
        ],
        restoring:
          'Data, not accounts. Someone signing in again with the same provider is linked back ' +
          'by verified email and their rows reattach by id. For a full restore use `supabase db dump`.',
      },
      null,
      2
    )
  );

  const total = Object.values(counts).reduce((n, c) => n + c, 0);
  log(`${total} row(s) across ${TABLES.length} tables -> ${path.relative(process.cwd(), OUT)}`);
}

main().catch((err) => {
  console.error(`[backup] ::error::${err.message}`);
  process.exit(1);
});
