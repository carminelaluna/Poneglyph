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
 * So this asks six things instead: the pages answer, the payloads parse and are
 * not empty, the deployed commit is the one that should be deployed, the archive is
 * not older than it has any reason to be, every page declares the address it is
 * actually at, and the file saying how to report a security problem is reachable
 * and in date.
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

/**
 * Pages whose `<head>` is checked, and the budget it is checked against.
 *
 * Two things here are invisible from inside the build and only wrong once
 * published. The canonical URL is written once in the root layout as `'./'`, which
 * Next resolves against each page's own pathname — if that ever resolves to the
 * root instead, all 8,700 pages declare themselves to be the home page and the
 * archive quietly stops being indexable as an archive. And a description is a
 * string nobody reads again: the home page carried 195 characters for months, of
 * which a search engine shows about 160, so the last third existed only in the
 * source.
 *
 * One page of each kind rather than all of them — this failure is systematic or it
 * is not there at all.
 */
const HEADS = ['/', '/cards/', '/decks/', '/prices/'];

/** Roughly what a search engine shows of a description. Advisory, so this warns. */
const DESCRIPTION_BUDGET = 160;

const problems = [];
const note = (m) => console.log(`[live] ${m}`);
/* Worth saying, not worth a red tick — the budget is advisory. */
const warn = (m) => console.log(`[live] ::warning::${m}`);
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

  /* 5 — each page says which address it is, and says it about itself. */
  let canonical = 0;
  for (const page of HEADS) {
    try {
      const res = await get(page);
      if (!res.ok) continue; /* already reported by the first check */
      const head = res.body.slice(0, res.body.indexOf('</head>'));

      const href = head.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1] ?? null;
      const want = `${BASE}${page}`;
      if (!href) fail(`${page} declares no canonical URL`);
      else if (href !== want) fail(`${page} says its canonical URL is ${href}, not ${want}`);
      else canonical++;

      const description = head.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
      if (!description) fail(`${page} carries no meta description`);
      else if (description.length > DESCRIPTION_BUDGET) {
        warn(
          `${page} has a ${description.length}-character description; ` +
            `about ${DESCRIPTION_BUDGET} of it is shown`
        );
      }
    } catch (err) {
      fail(`could not read the head of ${page}: ${err.message}`);
    }
  }
  note(`${canonical}/${HEADS.length} pages declare their own canonical URL`);

  /*
   * 6 — the way to report a security problem is reachable, and in date.
   *
   * build-static.mjs writes it on every deploy, so an expired one does not mean
   * somebody forgot; it means the site has stopped deploying. The dot-directory is
   * the part worth asking a live host about: whether GitHub Pages serves one is not
   * something the build can find out for itself.
   */
  try {
    const res = await get('/.well-known/security.txt');
    if (!res.ok) fail(`/.well-known/security.txt answered ${res.status}`);
    else {
      const expires = Date.parse(res.body.match(/^Expires:[ \t]*(\S+)/m)?.[1] ?? '');
      if (!Number.isFinite(expires)) fail('security.txt carries no readable Expires');
      else if (expires < Date.now()) {
        fail('security.txt has expired — every deploy rewrites it, so nothing has deployed');
      } else note(`security.txt in date until ${new Date(expires).toISOString().slice(0, 10)}`);
    }
  } catch (err) {
    fail(`could not read security.txt: ${err.message}`);
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
