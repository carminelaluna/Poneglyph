#!/usr/bin/env node
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

const TABLES = ['profiles', 'decks', 'organizer_requests', 'submissions', 'submission_decks'];

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
