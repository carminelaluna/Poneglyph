#!/usr/bin/env node
/**
 * Poneglyph — banned and restricted list.
 *
 *   node scripts/ingest-banlist.mjs
 *
 * Reads Bandai's own Banned/Restricted page. This is the one piece of data on the
 * site that is a *rule* rather than a description, so it comes from the rule-maker
 * and nowhere else — a community mirror would be a second-hand copy of something
 * whose whole value is being authoritative.
 *
 * The page is HTML with no API behind it, but it is regular: an "Active
 * Restrictions" section with three headed lists, each entry a bullet of
 * `CARD-ID Name`. That structure is what is parsed, and if it stops matching the
 * ingest fails loudly rather than writing an empty banlist — an empty banlist that
 * looks successful is worse than no banlist at all.
 *
 * Writes data/banlist.json.
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { RULES_SOURCES } from './sources.mjs';

const SRC = RULES_SOURCES.bandai;
const DATA = path.resolve('data');
const log = (...m) => console.log('[banlist]', ...m);

const CARD_ID = /\b([A-Z]{2,3}\d{2}-\d{3})\b/;

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'poneglyph-banlist/1.0' },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** Flatten the page to readable lines, keeping block boundaries. */
function toLines(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(h\d|p|li|td|th|tr|div|dt|dd|section)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** `・ OP06-047 Charlotte Pudding` -> { id, name }. */
function parseEntry(line) {
  const m = line.match(CARD_ID);
  if (!m) return null;
  const name = line
    .slice(line.indexOf(m[1]) + m[1].length)
    .replace(/^[\s:・.-]+/, '')
    .trim();
  return { id: m[1], name: name || null };
}

const HEADINGS = {
  'banned cards': 'banned',
  'restricted cards': 'restricted',
  'banned pair cards': 'pairs',
};

function parse(lines) {
  /* Only the "Active Restrictions" block is the current list — everything above it
     is the announcement of the most recent change, which repeats entries. */
  const start = lines.findIndex((l) => /cards with active restrictions/i.test(l));
  if (start === -1) throw new Error('could not find the "Active Restrictions" section');

  const sections = { banned: [], restricted: [], pairs: [] };
  let current = null;

  for (const line of lines.slice(start + 1)) {
    /* The history links at the foot of the page end the current list. */
    if (/^history of banned/i.test(line)) break;

    const heading = HEADINGS[line.toLowerCase().replace(/[^a-z ]/g, '').trim()];
    if (heading) {
      current = heading;
      continue;
    }
    if (!current) continue;
    if (/^there are currently no cards/i.test(line)) continue;
    if (!line.startsWith('・') && !CARD_ID.test(line)) continue;

    const entry = parseEntry(line);
    if (entry) sections[current].push(entry);
  }

  /* Pairs arrive as a flat list of two-card groups: A, B, A, B, … */
  const pairs = [];
  for (let i = 0; i + 1 < sections.pairs.length; i += 2) {
    pairs.push([sections.pairs[i], sections.pairs[i + 1]]);
  }

  return { banned: sections.banned, restricted: sections.restricted, pairs };
}

function effectiveDate(lines) {
  for (const line of lines) {
    const m = line.match(/effective from ([A-Z][a-z]+ \d{1,2}, 20\d\d)/i);
    if (m) return m[1];
  }
  return null;
}

async function main() {
  const started = Date.now();

  log(`reading ${SRC.restrictionUrl}`);
  const html = await fetchText(SRC.restrictionUrl);
  const lines = toLines(html);
  const { banned, restricted, pairs } = parse(lines);

  if (banned.length === 0 && restricted.length === 0 && pairs.length === 0) {
    throw new Error('parsed an entirely empty banlist — the page layout has probably changed');
  }

  /* Attach what we know about each card so the page can show art and colours. */
  let cards = [];
  try {
    cards = JSON.parse(await readFile(path.join(DATA, 'cards.json'), 'utf8'));
  } catch {
    log('cards.json not found — writing ids without card details');
  }
  const byId = new Map(cards.map((c) => [c.id, c]));

  const enrich = (entry) => {
    const card = byId.get(entry.id);
    return {
      id: entry.id,
      name: card?.name ?? entry.name,
      colors: card?.colors ?? [],
      category: card?.category ?? null,
      setCode: card?.setCode ?? null,
      blockNumber: card?.blockNumber ?? null,
      /* A Block 1 card is already out of Standard, so its ban only bites in Extra. */
      standardLegal: card?.standardLegal ?? null,
      known: Boolean(card),
    };
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    effectiveFrom: effectiveDate(lines),
    source: { label: SRC.label, url: SRC.restrictionUrl, home: SRC.home },
    counts: { banned: banned.length, restricted: restricted.length, pairs: pairs.length },
    banned: banned.map(enrich),
    restricted: restricted.map(enrich),
    pairs: pairs.map(([a, b]) => [enrich(a), enrich(b)]),
    durationMs: Date.now() - started,
  };

  const unknown = [...payload.banned, ...payload.restricted, ...payload.pairs.flat()].filter(
    (c) => !c.known
  );

  await mkdir(DATA, { recursive: true });
  await writeFile(path.join(DATA, 'banlist.json'), JSON.stringify(payload, null, 2));

  /*
   * And a copy the browser can read. The deck builder validates against it while you
   * are choosing cards, which is the moment it is worth knowing — the /banlist page
   * imports the build-time file and does not need this one.
   *
   * Only the card numbers travel. The full entries carry names, colours and set data
   * the builder already has from the card index.
   */
  const ids = {
    generatedAt: payload.generatedAt,
    effectiveFrom: payload.effectiveFrom ?? null,
    banned: (payload.banned ?? []).map((c) => c.id),
    restricted: (payload.restricted ?? []).map((c) => c.id),
    /* Cards that may not be played together, as pairs of card numbers. */
    pairs: (payload.pairs ?? []).map((pair) => pair.map((c) => c.id)),
  };
  await mkdir(path.resolve('public', 'data'), { recursive: true });
  await writeFile(path.resolve('public', 'data', 'banlist.json'), JSON.stringify(ids));

  log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  log(`effective from ${payload.effectiveFrom ?? 'unknown'}`);
  console.table(payload.counts);
  for (const c of payload.banned) log(`  banned      ${c.id.padEnd(10)} ${c.name ?? ''}`);
  for (const c of payload.restricted) log(`  restricted  ${c.id.padEnd(10)} ${c.name ?? ''}`);
  for (const [a, b] of payload.pairs) log(`  pair        ${a.id} + ${b.id}`);
  if (unknown.length) log(`${unknown.length} listed cards are not in the archive: ${unknown.map((c) => c.id).join(', ')}`);
}

main().catch((err) => {
  console.error('[banlist] FAILED —', err.message);
  process.exit(1);
});
