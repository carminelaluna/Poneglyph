#!/usr/bin/env node
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

const WANT = flag('commit');

const FRESH = args.includes('--just-deployed');

const STALE_HOURS = 48;

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

const HEADS = ['/', '/cards/', '/decks/', '/prices/'];

const DESCRIPTION_BUDGET = 160;

const problems = [];
const note = (m) => console.log(`[live] ${m}`);
const warn = (m) => console.log(`[live] ::warning::${m}`);
const shape = (m) =>
  FRESH ? warn(`${m} — the site may still be mid-deploy`) : fail(m);
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

  let full = 0;
  for (const { path, has } of PAYLOADS) {
    try {
      const res = await get(path, 'json');
      if (!res.ok) fail(`${path} answered ${res.status}`);
      else if (!has(res.body)) fail(`${path} parsed but is empty or the wrong shape`);
      else full++;
    } catch (err) {
      fail(`${path} did not parse (${err.message}) — usually a missing file, not a broken one`);
    }
  }
  note(`${full}/${PAYLOADS.length} payloads carry data`);

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

  let canonical = 0;
  for (const page of HEADS) {
    try {
      const res = await get(page);
      if (!res.ok) continue;
      const head = res.body.slice(0, res.body.indexOf('</head>'));

      const href = head.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1] ?? null;
      const want = `${BASE}${page}`;
      if (!href) shape(`${page} declares no canonical URL`);
      else if (href !== want) shape(`${page} says its canonical URL is ${href}, not ${want}`);
      else canonical++;

      const description = head.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
      if (!description) shape(`${page} carries no meta description`);
      else if (description.length > DESCRIPTION_BUDGET) {
        warn(
          `${page} has a ${description.length}-character description; ` +
            `about ${DESCRIPTION_BUDGET} of it is shown`
        );
      }
    } catch (err) {
      shape(`could not read the head of ${page}: ${err.message}`);
    }
  }
  note(`${canonical}/${HEADS.length} pages declare their own canonical URL`);

  try {
    const res = await get('/.well-known/security.txt');
    if (!res.ok) shape(`/.well-known/security.txt answered ${res.status}`);
    else {
      const expires = Date.parse(res.body.match(/^Expires:[ \t]*(\S+)/m)?.[1] ?? '');
      if (!Number.isFinite(expires)) shape('security.txt carries no readable Expires');
      else if (expires < Date.now()) {
        shape('security.txt has expired — every deploy rewrites it, so nothing has deployed');
      } else note(`security.txt in date until ${new Date(expires).toISOString().slice(0, 10)}`);
    }
  } catch (err) {
    shape(`could not read security.txt: ${err.message}`);
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
