#!/usr/bin/env node
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DECK_SOURCES } from './sources.mjs';
import { KEEP_AT_LEAST, refusesWrite } from './corpus-guard.mjs';
import { BACKOFF, exitOnFailure, finalError, refusal, TURNED_AWAY, writtenAt } from './refusal.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const SRC = DECK_SOURCES.topdecks;
const DATA = path.resolve('data');
const log = (...m) => console.log('[topdecks]', ...m);

const REGIONS = {
  jp: {
    key: 'jp',
    id: 'JP',
    label: 'Japan',
    match: /\/deck-list\/(japan|japanese|jp-format)/i,
    file: 'decks-jp',
  },
  en: {
    key: 'en',
    id: 'EN',
    label: 'English archive',
    match: /\/deck-list\/(english|en-format)/i,
    file: 'decks-en',
  },
};

async function get(url, { retries = 4 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'poneglyph-topdecks/1.0' },
        signal: AbortSignal.timeout(60_000),
      });
      if (TURNED_AWAY.includes(res.status)) {
        throw refusal(`HTTP ${res.status} — the upstream turned us away`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    } catch (err) {
      if (attempt === retries) throw finalError(url, err);
      const wait = BACKOFF[attempt - 1] ?? 30;
      log(`  ${err.message} — retrying in ${wait}s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
  return null;
}

const recorded = (region) =>
  readFile(path.join(DATA, `${region.file}.json`), 'utf8')
    .then((raw) => JSON.parse(raw).decks?.length ?? 0)
    .catch(() => 0);

function decodeDeck(dg) {
  const out = [];
  for (const chunk of decodeURIComponent(dg).split('a')) {
    const m = chunk.match(/^(\d+)n([A-Z]{1,4}\d{0,2}-\d{1,4})$/i);
    if (!m) continue;
    out.push({ id: m[2].toUpperCase(), count: Number(m[1]) });
  }
  return out;
}

function parsePlacing(raw) {
  const text = decodeURIComponent(raw ?? '').replace(/\+/g, ' ').trim();
  const place = text.match(/^(\d+)\s*(?:st|nd|rd|th)/i);
  const record = text.match(/\((\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?\)/);
  return {
    placing: place ? Number(place[1]) : null,
    record: record
      ? { wins: Number(record[1]), losses: Number(record[2]), ties: Number(record[3] ?? 0) }
      : { wins: 0, losses: 0, ties: 0 },
  };
}

function parseDate(raw) {
  const m = decodeURIComponent(raw ?? '')
    .replace(/\+/g, ' ')
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

const TIER_PATTERNS = [
  [/final/i, 'finals'],
  [/champ/i, 'championship'],
  [/region/i, 'regional'],
  [/store|shop|^sb|^fs|flagship/i, 'store'],
  [/3v3|team/i, 'local'],
];

function tierOf(tn) {
  const text = decodeURIComponent(tn ?? '').replace(/\+/g, ' ').trim();
  for (const [pattern, tier] of TIER_PATTERNS) if (pattern.test(text)) return tier;
  return 'local';
}

const clean = (v) => decodeURIComponent(v ?? '').replace(/\+/g, ' ').trim();

function decksFromPage(html, link) {
  const decks = [];
  const seen = new Set();

  for (const m of html.matchAll(/deckgen\/?\?([^"']+)/g)) {
    const params = new URLSearchParams(m[1].replace(/&amp;/g, '&'));
    const dg = params.get('dg');
    if (!dg) continue;

    const cards = decodeDeck(dg);
    if (cards.length === 0) continue;

    const date = parseDate(params.get('date'));
    const { placing, record } = parsePlacing(params.get('pl'));

    const key = `${date}|${clean(params.get('au'))}|${dg.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    decks.push({
      date,
      player: clean(params.get('au')) || 'Unknown',
      country: clean(params.get('cn')) || null,
      leaderName: clean(params.get('dn')),
      placing,
      record,
      host: clean(params.get('hs')),
      eventType: clean(params.get('tn')),
      tier: tierOf(params.get('tn')),
      cards,
      page: link,
    });
  }

  return decks;
}

async function main() {
  const started = Date.now();

  const archive = JSON.parse(await readFile(path.join(DATA, 'cards.json'), 'utf8'));
  const byId = new Map(archive.map((c) => [c.id, c]));

  log('reading the deck-list index…');
  const index = await get(SRC.indexUrl);
  const links = [
    ...new Set(
      [...index.matchAll(/href=["']([^"']*\/deck-list\/[^"']+)["']/g)]
        .map((m) => m[1].replace(/^https?:\/\/onepiecetopdecks\.com/, ''))
        .filter((u) => u !== '/deck-list/' && !/\/deckgen/.test(u))
    ),
  ].map((u) => `https://onepiecetopdecks.com${u.startsWith('/') ? u : `/${u}`}`);

  log(`  ${links.length} deck-list pages on the index`);

  if (links.length === 0) {
    throw refusal(
      `${SRC.indexUrl}: the deck-list index carried no links — served, but not by the archive`
    );
  }

  const chosen = flag('region', 'both');
  const wantRegions = (chosen === 'both' ? ['jp', 'en'] : [chosen]).filter((r) => REGIONS[r]);
  if (wantRegions.length === 0) throw new Error('--region must be jp, en, or both');

  const limit = Number(flag('limit', 0)) || Infinity;
  const limited = Number.isFinite(limit);
  const summary = {};
  const refused = [];

  for (const key of wantRegions) {
    const region = REGIONS[key];
    const pages = links.filter((u) => region.match.test(u)).slice(0, limit);
    log('');
    log(`${region.label}: ${pages.length} pages`);
    if (pages.length === 0) {
      refused.push({ region: region.label, found: 0, held: await recorded(region) });
      log(`  no pages matched ${region.match} — has the URL prefix changed again?`);
      continue;
    }

    const collected = [];
    const stats = { pages: 0, wrongSize: 0, unresolved: 0, noDate: 0 };

    for (const link of pages) {
      const html = await get(link);
      const found = decksFromPage(html, link);
      stats.pages++;
      log(`  ${String(found.length).padStart(4)} decks — ${link.replace(SRC.home, '')}`);

      for (const deck of found) {
        if (!deck.date) {
          stats.noDate++;
          continue;
        }

        const leader = deck.cards.find((c) => byId.get(c.id)?.category === 'Leader');
        const rest = deck.cards.filter((c) => c !== leader);
        const total = rest.reduce((n, c) => n + c.count, 0);

        if (!leader || total !== 50) {
          stats.wrongSize++;
          continue;
        }

        const resolved = [];
        for (const c of rest) {
          const card = byId.get(c.id);
          if (!card) {
            stats.unresolved++;
            continue;
          }
          resolved.push({ id: c.id, count: c.count, category: card.category });
        }

        const leaderCard = byId.get(leader.id);
        collected.push({
          id: `${key}-${deck.date}-${deck.player}-${leader.id}`
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, '-'),
          region: region.id,
          source: SRC.id,
          date: deck.date,
          player: deck.player,
          country: deck.country,
          placing: deck.placing,
          record: deck.record,
          leaderId: leader.id,
          leaderName: leaderCard?.name ?? deck.leaderName,
          colors: leaderCard?.colors ?? [],
          eventName: deck.host || deck.eventType || `${region.label} event`,
          eventType: deck.eventType,
          tier: deck.tier,
          cards: resolved,
          total,
          sourceUrl: deck.page,
        });
      }
    }

    const decks = [...new Map(collected.map((d) => [d.id, d])).values()].sort((a, b) =>
      b.date.localeCompare(a.date)
    );

    const meta = {
      generatedAt: new Date().toISOString(),
      region: region.id,
      regionLabel: region.label,
      source: { id: SRC.id, label: SRC.label, home: SRC.home },
      counts: {
        decks: decks.length,
        pages: stats.pages,
        archetypes: new Set(decks.map((d) => d.leaderId)).size,
      },
      dropped: {
        wrongSize: stats.wrongSize,
        unresolvedCards: stats.unresolved,
        noDate: stats.noDate,
      },
      window: { from: decks.at(-1)?.date ?? null, to: decks[0]?.date ?? null },
      tiers: decks.reduce((tally, d) => {
        tally[d.tier] = (tally[d.tier] ?? 0) + 1;
        return tally;
      }, {}),
      durationMs: Date.now() - started,
    };

    const held = await recorded(region);

    if (refusesWrite(decks.length, held, KEEP_AT_LEAST)) {
      if (limited) {
        log(`  --limit is set, so this is a spot check — the ${held} on disk stand`);
        summary[region.label] = `${held} kept (--limit)`;
        continue;
      }

      refused.push({ region: region.label, found: decks.length, held });
      log(
        `  refusing to write ${decks.length} decks over the ${held} already recorded ` +
          `— keeping what is on disk`
      );
      summary[region.label] = `${held} kept`;
      continue;
    }

    await mkdir(DATA, { recursive: true });
    await writeFile(path.join(DATA, `${region.file}.json`), JSON.stringify({ ...meta, decks }));

    summary[region.label] = decks.length;
    log(`  -> ${decks.length} decks, ${meta.counts.archetypes} archetypes, ${meta.window.from} to ${meta.window.to}`);
    log(`     dropped: ${stats.wrongSize} wrong-size, ${stats.unresolved} unresolved cards, ${stats.noDate} undated`);
  }

  log('');
  log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.table(summary);

  for (const r of refused) {
    console.log(
      `::warning::Top Decks returned ${r.found} decks for ${r.region}, against ` +
        `${r.held} already recorded. Nothing was written. This host answers some ` +
        `datacenter IPs with a challenge that parses as an empty page; if it ` +
        `persists across several runs, read one of the pages by hand.`
    );
  }
}

main().catch(async (err) =>
  exitOnFailure('topdecks', err, 'nothing written; the archive keeps the decks it had', {
    since: await writtenAt(path.join(DATA, 'decks-en.json')),
  })
);
