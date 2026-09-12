#!/usr/bin/env node
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { cleanMarkup } from './discord.mjs';
import { SPOILER_SOURCES } from './sources.mjs';
import { BACKOFF, exitOnFailure, finalError, refusal, TURNED_AWAY, writtenAt } from './refusal.mjs';

const SRC = SPOILER_SOURCES.topdecks;
const DATA = path.resolve('data');

const log = (...m) => console.log('[spoilers]', ...m);

async function getJson(url, { retries = 4 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'poneglyph-spoilers/1.0', accept: 'application/json' },
        signal: AbortSignal.timeout(45_000),
      });

      if (TURNED_AWAY.includes(res.status)) {
        throw refusal(`HTTP ${res.status} — the upstream turned us away`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const body = await res.text();
      if (body.trimStart().startsWith('<')) {
        const snippet = body.trim().slice(0, 120).replace(/\s+/g, ' ');
        throw refusal(`HTTP ${res.status} with an HTML body — ${snippet}`);
      }
      return JSON.parse(body);
    } catch (err) {
      if (attempt === retries) throw finalError(url, err);
      const wait = BACKOFF[attempt - 1] ?? 30;
      log(`  ${err.message} — retrying in ${wait}s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
  return null;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#8217': '’', '#8211': '–', '#039': "'" };
const decode = (v) =>
  String(v ?? '')
    .replace(/&(#?\w+);/g, (whole, code) => ENTITIES[code] ?? whole)
    .trim();

const stripTags = (html) =>
  String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function setsFromTitle(title) {
  const found = new Set();
  for (const m of title.matchAll(/\b(OP|EB|ST|PRB)\s?-?\s?(\d{2})\b/gi)) {
    found.add(`${m[1].toUpperCase()}${m[2]}`);
  }
  const range = title.match(/\b(ST)(\d{2})\s*(?:~|to|-)\s*(?:ST)?(\d{2})\b/i);
  if (range) {
    for (let n = Number(range[2]); n <= Number(range[3]); n++) {
      found.add(`ST${String(n).padStart(2, '0')}`);
    }
  }
  return [...found];
}

function cardsFromHtml(html) {
  const cards = new Map();
  for (const m of html.matchAll(
    /(?:src|data-src)="([^"]*?\/([A-Z]{2,3}\d{2})-(\d{3})(?![\dx])[^/"]*\.(?:jpe?g|png|webp))"/gi
  )) {
    const id = `${m[2].toUpperCase()}-${m[3]}`;
    if (!cards.has(id)) cards.set(id, { id, image: m[1] });
  }
  return cards;
}

const NAME_NOISE = /\s+(?:[A-Z]{2,3}\d{2}|set|card|manga|secret|super|treasure|rare|leader|parallel|alt|alternate|art|version)\b.*$/i;
const cleanName = (raw) => raw.replace(NAME_NOISE, '').replace(/[\s.,:;-]+$/, '').trim();

function namesFromText(text) {
  const names = new Map();

  for (const m of text.matchAll(
    /([A-Z]{2,3}\d{2}-\d{3})\s+([A-Z][A-Za-z0-9.'’\-]*(?:\s+[A-Z][A-Za-z0-9.'’\-]*){0,3})/g
  )) {
    const name = cleanName(m[2].replace(/\s+/g, ' ').trim());
    if (name.length >= 2) names.set(m[1].toUpperCase(), name);
  }

  for (const m of text.matchAll(/([A-Z][A-Za-z0-9.'’!&\- ]{1,44}?)\s*\(([A-Z]{2,3}\d{2}-\d{3})\)/g)) {
    const name = cleanName(m[1].replace(/\s+/g, ' ').trim());
    if (!name || name.split(' ').length > 7) continue;
    names.set(m[2].toUpperCase(), name);
  }

  return names;
}

function releaseFromText(text) {
  return (
    text.match(/releases?\s+(?:in\s+)?([A-Z][a-z]+\s+20\d\d)/i)?.[1] ??
    text.match(/\((\d{1,2}\s+[A-Z][a-z]{2,8}\s+20\d\d)/)?.[1] ??
    text.match(/\b([A-Z][a-z]{2,8}\s+20\d\d)\b/)?.[1] ??
    null
  );
}

async function main() {
  const started = Date.now();

  const cards = JSON.parse(await readFile(path.join(DATA, 'cards.json'), 'utf8'));
  const released = new Set(cards.map((c) => c.id.split('-')[0].toUpperCase()));
  log(`${released.size} set prefixes already in the card archive`);

  const posts = [];
  const seenPosts = new Set();
  for (const [category, label] of SRC.leakCategories) {
    log(`reading ${label}…`);
    const batch = await getJson(SRC.postsUrl(category));
    if (!Array.isArray(batch)) throw new Error(`unexpected response from the posts API (${label})`);
    let added = 0;
    for (const post of batch) {
      if (seenPosts.has(post.id)) continue;
      seenPosts.add(post.id);
      posts.push(post);
      added++;
    }
    log(`  ${batch.length} posts, ${added} new to this run`);
  }

  const upcoming = new Map();
  const shipped = new Map();

  for (const post of posts) {
    const title = decode(post.title?.rendered);
    const html = post.content?.rendered ?? '';
    const text = stripTags(html);

    const titleSets = setsFromTitle(title);
    const cards = cardsFromHtml(html);
    const names = namesFromText(text);
    const release = releaseFromText(text) ?? releaseFromText(title);

    const candidates = new Set([
      ...titleSets,
      ...[...cards.keys()].map((id) => id.split('-')[0]),
    ]);

    for (const set of candidates) {
      if (released.has(set)) {
        if (!titleSets.includes(set)) continue;
        const seen = shipped.get(set);
        if (!seen || post.date > seen.lastCoverage) {
          shipped.set(set, {
            set,
            code: set.replace(/^([A-Z]+)(\d+)$/, '$1-$2'),
            lastCoverage: post.date,
          });
        }
        continue;
      }

      if (!upcoming.has(set)) {
        upcoming.set(set, {
          set,
          code: set.replace(/^([A-Z]+)(\d+)$/, '$1-$2'),
          release: null,
          cards: new Map(),
          articles: [],
        });
      }
      const entry = upcoming.get(set);

      if (!entry.release && release && titleSets.includes(set)) entry.release = release;

      for (const [id, card] of cards) {
        if (!id.startsWith(`${set}-`)) continue;
        if (!entry.cards.has(id)) {
          entry.cards.set(id, { id, name: names.get(id) ?? null, image: card.image });
        } else if (!entry.cards.get(id).name && names.get(id)) {
          entry.cards.get(id).name = names.get(id);
        }
      }

      if (!entry.articles.some((a) => a.url === post.link)) {
        entry.articles.push({ title, url: post.link, date: post.date });
      }
    }
  }

  const fromDiscord = await readFile(path.join(DATA, 'spoilers-discord.json'), 'utf8')
    .then((raw) => JSON.parse(raw))
    .catch(() => null);

  if (fromDiscord?.sets?.length) {
    let added = 0;
    for (const set of fromDiscord.sets) {
      if (released.has(set.set.toUpperCase())) continue;

      if (!upcoming.has(set.set)) {
        upcoming.set(set.set, {
          set: set.set,
          code: set.set.replace(/^([A-Z]+)(\d+)$/, '$1-$2'),
          release: null,
          cards: new Map(),
          articles: [],
        });
      }
      const entry = upcoming.get(set.set);
      for (const card of set.cards) {
        if (entry.cards.has(card.id)) continue;
        entry.cards.set(card.id, {
          id: card.id,
          name: card.name ?? null,
          image: null,
          thumb: card.thumb ?? null,
          text: card.text ? cleanMarkup(card.text) || null : null,
        });
        added++;
      }
    }
    log(`  ${added} cards from Discord that the articles did not have`);
  }

  const spoilers = [...upcoming.values()]
    .map((entry) => ({
      set: entry.set,
      code: entry.code,
      release: entry.release,
      kind: entry.set.startsWith('ST')
        ? 'Starter deck'
        : entry.set.startsWith('EB')
          ? 'Extra booster'
          : entry.set.startsWith('PRB')
            ? 'Premium booster'
            : 'Booster set',
      revealed: entry.cards.size,
      cards: [...entry.cards.values()].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })),
      articles: entry.articles.sort((a, b) => b.date.localeCompare(a.date)),
      lastCoverage: entry.articles.map((a) => a.date).sort().at(-1) ?? null,
    }))
    .filter((s) => s.revealed > 0 || s.articles.length > 0)
    .sort((a, b) => (b.lastCoverage ?? '').localeCompare(a.lastCoverage ?? ''));

  const cutoff = new Date(Date.now() - 365 * 86_400_000).toISOString();

  const setsByPrefix = new Map();
  for (const card of cards) {
    const prefix = card.id.split('-')[0].toUpperCase();
    if (!setsByPrefix.has(prefix)) {
      setsByPrefix.set(prefix, { code: card.setCode, name: card.setName, cards: 0 });
    }
    setsByPrefix.get(prefix).cards++;
  }

  const nowReleased = [...shipped.values()]
    .map((entry) => {
      const info = setsByPrefix.get(entry.set);
      return {
        ...entry,
        code: info?.code ?? entry.code,
        name: info?.name ?? null,
        cards: info?.cards ?? 0,
        slug: (info?.code ?? entry.code).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      };
    })
    .filter((e) => e.cards > 0 && e.lastCoverage >= cutoff)
    .sort((a, b) => b.lastCoverage.localeCompare(a.lastCoverage))
    .slice(0, 6);

  const meta = {
    generatedAt: new Date().toISOString(),
    source: { id: SRC.id, label: SRC.label, home: SRC.home, category: SRC.leaksCategoryName },
    counts: {
      sets: spoilers.length,
      cards: spoilers.reduce((n, s) => n + s.revealed, 0),
      named: spoilers.reduce((n, s) => n + s.cards.filter((c) => c.name).length, 0),

      articles: new Set(spoilers.flatMap((s) => s.articles.map((a) => a.url))).size,
    },
    durationMs: Date.now() - started,
  };

  const payload = { ...meta, sets: spoilers, released: nowReleased };

  await mkdir(DATA, { recursive: true });
  await mkdir(path.resolve('public', 'data'), { recursive: true });
  await Promise.all([
    writeFile(path.join(DATA, 'spoilers.json'), JSON.stringify(payload, null, 2)),
    writeFile(path.resolve('public', 'data', 'spoilers.json'), JSON.stringify(payload)),
  ]);

  log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.table(meta.counts);
  for (const s of spoilers) {
    log(`  ${s.code.padEnd(8)} ${String(s.revealed).padStart(3)} cards  ${s.release ?? 'date unknown'}`);
  }
}

main().catch(async (err) => {
  exitOnFailure('spoilers', err, 'nothing written; the archive keeps the reveals it had', {
    since: await writtenAt(path.join(DATA, 'spoilers.json')),
  });
});
