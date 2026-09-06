#!/usr/bin/env node
/**
 * Poneglyph — is the published site actually working?
 *
 *   node scripts/check-live.mjs [--base https://…] [--commit <sha>]
 *
 * A ping would answer the question this site does not fail at. It is static: if
 * GitHub Pages is serving anything at all, it is serving HTML. The ways it has
 * actually broken are quieter, and each of them left a green tick behind:
 *
 *   - **A workflow succeeded and deployed nothing.** `Publish site` finishing is
 *     not the site being live, and once `main-selfhost` held a build the Pages
 *     step had not picked up.
 *   - **An ingest ran green while writing nothing.** `update-spoilers` did that for
 *     five days. What surfaced it was a person opening the page.
 *   - **A payload was written empty.** Two writers raced and left a 0 KB index; the
 *     pages that read it said "not found" and nothing failed.
 *
 * So this asks four things instead: the pages answer, the payloads parse and are
 * not empty, the deployed commit is the one that should be deployed, and the
 * archive is not older than it has any reason to be.
 *
 * Exit 1 on anything wrong. Nothing here writes.
 */

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const BASE = (
  flag('base') ??
  process.env.PONEGLYPH_SITE_URL ??
  'https://carminelaluna.github.io/Poneglyph'
).replace(/\/+$/, '');

/**
 * The commit that ought to be live, and **only when asked**.
 *
 * It used to fall back to `GITHUB_SHA`, which Actions always sets — so the check
 * compared on every run and went red the first time it ran after a deploy, when
 * Pages was still building and the site being one commit behind was simply true.
 * That is the failure this whole workflow is supposed to avoid: a job that is red
 * for something that is working teaches people to stop reading it.
 *
 * There is no honest way to check this on a schedule either. Pages can take an
 * hour, so "behind" and "broken" look identical from here. What catches a deploy
 * that stopped happening is the staleness check below: if nothing is publishing,
 * the archive passes 48 hours and says so.
 */
const WANT = flag('commit');

/**
 * How old the deck archive may be before something is wrong.
 *
 * `update-decks` runs twice a day, and GitHub delays a scheduled run by hours —
 * four is ordinary and a run can be dropped outright. Forty-eight hours is two
 * whole cycles missed, which is a real fault rather than a busy afternoon. The
 * cost of guessing low here is a red tick nobody believes, which is worse than
 * no check at all.
 */
const STALE_HOURS = 48;

/** Pages that must answer. One of each kind, not all 8,700. */
const PAGES = [
  '/',
  '/cards/',
  '/cards/op05-041/',
  '/decks/',
  '/decks/op05-041/',
  '/decks/op05-041/matchups/',
  '/compare/',
  '/prices/',
  '/tournaments/',
  '/players/',
  '/events/',
  '/spoilers/',
  '/banlist/',
  '/deckbuilder/',
  '/legal/',
  '/privacy/',
  '/terms/',
  '/404.html',
];

/**
 * Payloads, with what "not empty" means for each.
 *
 * The shape matters as much as the status: a 200 carrying `{}` is exactly what a
 * raced writer leaves behind, and every page reading it renders "not found"
 * without anything failing.
 */
const PAYLOADS = [
  { path: '/data/decks-en-index.json', has: (d) => d.decks?.length > 0 && d.eras?.length > 0 },
  { path: '/data/decks-jp-index.json', has: (d) => d.decks?.length > 0 },
  { path: '/data/cards-index.json', has: (d) => (d.cards ?? d).length > 100 },
  { path: '/data/leaders.json', has: (d) => Object.keys(d).length > 50 },
  { path: '/data/card-names.json', has: (d) => Object.keys(d).length > 500 },
  { path: '/data/tournaments-index.json', has: (d) => d.events?.length > 0 },
  { path: '/data/players-index.json', has: (d) => d.players?.length > 0 },
  { path: '/data/events-official.json', has: (d) => (d.groups ?? d.events ?? []).length > 0 },
];

const problems = [];
const note = (m) => console.log(`[live] ${m}`);
const fail = (m) => {
  problems.push(m);
  console.log(`[live] ::error::${m}`);
};

async function get(path, as = 'text') {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'user-agent': 'poneglyph-live-check/1.0' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, status: res.status, body: as === 'json' ? await res.json() : await res.text() };
}

async function main() {
  note(`checking ${BASE}`);

  /* 1 — the pages answer. */
  let served = 0;
  for (const path of PAGES) {
    try {
      const res = await get(path);
      if (res.ok) served++;
      else fail(`${path} answered ${res.status}`);
    } catch (err) {
      fail(`${path} did not answer: ${err.message}`);
    }
  }
  note(`${served}/${PAGES.length} pages answered`);

  /* 2 — the payloads parse, and hold something. */
  let full = 0;
  for (const { path, has } of PAYLOADS) {
    try {
      const res = await get(path, 'json');
      if (!res.ok) fail(`${path} answered ${res.status}`);
      else if (!has(res.body)) fail(`${path} parsed but is empty or the wrong shape`);
      else full++;
    } catch (err) {
      /*
       * A static host answers a missing payload with the whole of 404.html, which
       * is HTML where JSON was promised — so a parse error here usually means the
       * file is not there rather than that it is corrupt.
       */
      fail(`${path} did not parse (${err.message}) — usually a missing file, not a broken one`);
    }
  }
  note(`${full}/${PAYLOADS.length} payloads carry data`);

  /* 3 — the deployed commit is the one that should be. */
  if (WANT) {
    try {
      const res = await get('/.source');
      const live = String(res.body ?? '').trim();
      if (!res.ok) fail('/.source is missing — the deploy may not have run');
      else if (live !== WANT) {
        fail(`the site is built from ${live.slice(0, 9)}, not ${WANT.slice(0, 9)}`);
      } else note(`built from ${live.slice(0, 9)}, as expected`);
    } catch (err) {
      fail(`could not read /.source: ${err.message}`);
    }
  }

  /* 4 — the archive is not older than it has reason to be. */
  try {
    const res = await get('/data/decks-en-index.json', 'json');
    const written = Date.parse(res.body?.generatedAt ?? '');
    if (!Number.isFinite(written)) fail('the deck index carries no generatedAt');
    else {
      const hours = (Date.now() - written) / 3_600_000;
      if (hours > STALE_HOURS) {
        fail(
          `the deck archive was last written ${hours.toFixed(0)}h ago, over the ` +
            `${STALE_HOURS}h an ingest running twice a day should ever leave`
        );
      } else note(`archive written ${hours.toFixed(1)}h ago`);
    }
  } catch (err) {
    fail(`could not read the deck index: ${err.message}`);
  }

  if (problems.length) {
    console.log(`\n[live] ${problems.length} problem(s):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  note('everything answered, parsed and is current');
}

main().catch((err) => {
  console.log(`[live] ::error::the check itself failed: ${err.message}`);
  process.exit(1);
});
