#!/usr/bin/env node
/**
 * Poneglyph — spoiler ingest.
 *
 *   node scripts/ingest-spoilers.mjs
 *
 * Reads the "Card Leaks" category from One Piece Top Decks and turns the coverage
 * of unreleased sets into structured data: which sets are coming, when, and which
 * card numbers have been revealed so far.
 *
 * The definition of a spoiler here is deliberately mechanical: **a card belonging
 * to a set that is not yet in our own card archive**. That makes the page
 * self-clearing — the day OP-18 reaches the official card list and the card ingest
 * picks it up, it stops being a spoiler and becomes a set, with no edit here.
 *
 * On images: the card scans belong to One Piece Top Decks, who did the work of
 * finding and publishing them. They are referenced from their server and credited
 * per set rather than copied into ours — pre-release art is not something to
 * re-host, and they should get the traffic.
 *
 * Writes data/spoilers.json and public/data/spoilers.json.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
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

      /*
       * Read as text and parse here, so a refusal served as a 200 is diagnosable.
       * Before this the only evidence was "Unexpected token '<'", which does not
       * say whether we were challenged, rate-limited or served an error page.
       */
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

/* ------------------------------------------------------------- extraction */

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

/** `OP-18`, `EB05`, `ST31 ~ ST36` in a headline -> the set codes it is about. */
function setsFromTitle(title) {
  const found = new Set();
  for (const m of title.matchAll(/\b(OP|EB|ST|PRB)\s?-?\s?(\d{2})\b/gi)) {
    found.add(`${m[1].toUpperCase()}${m[2]}`);
  }
  // "ST31 ~ ST36" and "ST31 to ST36" describe a whole wave.
  const range = title.match(/\b(ST)(\d{2})\s*(?:~|to|-)\s*(?:ST)?(\d{2})\b/i);
  if (range) {
    for (let n = Number(range[2]); n <= Number(range[3]); n++) {
      found.add(`ST${String(n).padStart(2, '0')}`);
    }
  }
  return [...found];
}

/**
 * Card scans are uploaded under their own card number, which is the useful part.
 *
 * The lookahead is not decoration. WordPress writes a resized copy of every upload
 * as `name-{width}x{height}`, so `prb22-1024x461.jpeg` reads as set `PRB22`, card
 * `102` — a set that does not exist, holding one card that does not exist, which
 * this page would then announce as an unreleased set. Card numbers are three
 * digits and nothing follows them but a separator, so refusing a fourth digit
 * throws the resize suffixes out and keeps `-aa`, `_p1` and `_p2`.
 */
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

/**
 * Prose names its cards both ways round — `Franky (OP18-021)` and
 * `OP18-078 Mini-Merry` — so both are read, with the parenthesised form winning
 * because it is the less ambiguous of the two.
 */
/* Trailing set codes and rarity words get swept up by the loose capture. */
const NAME_NOISE = /\s+(?:[A-Z]{2,3}\d{2}|set|card|manga|secret|super|treasure|rare|leader|parallel|alt|alternate|art|version)\b.*$/i;
const cleanName = (raw) => raw.replace(NAME_NOISE, '').replace(/[\s.,:;-]+$/, '').trim();

function namesFromText(text) {
  const names = new Map();

  /* `OP18-078 Mini-Merry` — up to four capitalised words following the number. */
  for (const m of text.matchAll(
    /([A-Z]{2,3}\d{2}-\d{3})\s+([A-Z][A-Za-z0-9.'’\-]*(?:\s+[A-Z][A-Za-z0-9.'’\-]*){0,3})/g
  )) {
    const name = cleanName(m[2].replace(/\s+/g, ' ').trim());
    if (name.length >= 2) names.set(m[1].toUpperCase(), name);
  }

  /* `Franky (OP18-021)` overwrites, being the clearer form. */
  for (const m of text.matchAll(/([A-Z][A-Za-z0-9.'’!&\- ]{1,44}?)\s*\(([A-Z]{2,3}\d{2}-\d{3})\)/g)) {
    const name = cleanName(m[1].replace(/\s+/g, ' ').trim());
    // Skip fragments that are clearly a sentence tail rather than a card name.
    if (!name || name.split(' ').length > 7) continue;
    names.set(m[2].toUpperCase(), name);
  }

  return names;
}

/** "releases November 2026", "(31 Jan 2026 for Japan)". */
function releaseFromText(text) {
  return (
    text.match(/releases?\s+(?:in\s+)?([A-Z][a-z]+\s+20\d\d)/i)?.[1] ??
    text.match(/\((\d{1,2}\s+[A-Z][a-z]{2,8}\s+20\d\d)/)?.[1] ??
    text.match(/\b([A-Z][a-z]{2,8}\s+20\d\d)\b/)?.[1] ??
    null
  );
}

/* ------------------------------------------------------------------- main */

async function main() {
  const started = Date.now();

  /*
   * Which sets we already have, taken from the card ids rather than the set codes.
   * Set codes are not always the prefix of their cards — the OP-14 crossover set is
   * coded `OP14-EB04` while its cards are `OP14-036` — and comparing codes made
   * released sets look like spoilers.
   */
  const cards = JSON.parse(await readFile(path.join(DATA, 'cards.json'), 'utf8'));
  const released = new Set(cards.map((c) => c.id.split('-')[0].toUpperCase()));
  log(`${released.size} set prefixes already in the card archive`);

  /*
   * Two categories, because this site files the same kind of post in both. "Card
   * Leaks" holds 15 posts; "Uncategorized" holds the leak coverage for ST-31..36,
   * OP-15, EB-04, ST-29 and the P-122 promos, none of which are in Card Leaks.
   * Reading only the one named for the job missed those until each set shipped.
   *
   * It adds no cards today — both categories top out at the same two articles —
   * which is worth stating plainly: this is coverage for the next time, not a fix
   * for a set we are currently missing.
   */
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

  /** setCode -> everything known about it */
  const upcoming = new Map();
  /** Sets that were covered as leaks and have since shipped. */
  const shipped = new Map();

  for (const post of posts) {
    const title = decode(post.title?.rendered);
    const html = post.content?.rendered ?? '';
    const text = stripTags(html);

    const titleSets = setsFromTitle(title);
    const cards = cardsFromHtml(html);
    const names = namesFromText(text);
    const release = releaseFromText(text) ?? releaseFromText(title);

    /* Which sets does this post actually reveal something new about? */
    const candidates = new Set([
      ...titleSets,
      ...[...cards.keys()].map((id) => id.split('-')[0]),
    ]);

    for (const set of candidates) {
      /*
       * A set that has reached the archive is no longer a spoiler, but it is still
       * worth naming: readers who watched it get revealed should be shown where it
       * went rather than finding it silently gone.
       */
      if (released.has(set)) {
        /*
         * Only when the article was *about* this set. Leak posts illustrate with
         * cards from older sets, and counting those made a 2022 set look like it had
         * just been revealed.
         */
        if (!titleSets.includes(set)) continue;
        const seen = shipped.get(set);
        /* Keep the most recent coverage, not whichever post was read last. */
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

      /* The headline set of the post is the one whose release date we trust. */
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

  /*
   * The Discord corpus, folded in as a second source — the same shape as
   * build-indexes.mjs folding community decks into the deck archive.
   *
   * It is read rather than fetched, because `ingest-discord.mjs` needs a bot token
   * and this ingest must keep working on a checkout that has none. A missing file
   * is simply a site without that source configured.
   *
   * Discord is the fast half and the web source is the documented half: the
   * channel had 12 EB-05 cards on the day the articles had 2, and the articles
   * carry the release month and the card names that the channel does not. Neither
   * is a superset, so both are merged and the first sighting of a card wins.
   *
   * Images are deliberately dropped. Discord's attachment URLs are signed and
   * expire within hours, so writing one into a payload the browser reads later
   * publishes a link that is already dead — worse than no image, because it
   * renders as a broken one.
   */
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
        entry.cards.set(card.id, { id: card.id, name: null, image: null });
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
    /* A set with no revealed cards and no coverage date is just a rumour. */
    .filter((s) => s.revealed > 0 || s.articles.length > 0)
    .sort((a, b) => (b.lastCoverage ?? '').localeCompare(a.lastCoverage ?? ''));

  const cutoff = new Date(Date.now() - 365 * 86_400_000).toISOString();

  /* Where each shipped set can now be read in full. */
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
    /* Only sets whose reveals are still in living memory — an OP-01 article from
       2022 is history, not a set that just graduated from this page. */
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
  /*
   * An upstream that will not talk to us is not a broken ingest.
   *
   * Nothing has been written — this throws long before the write — so the site
   * keeps serving the reveals it already had, which is the correct outcome. Failing
   * the run as well would paint the schedule red every few hours for something
   * entirely outside this repository, and a workflow that is red half the time is a
   * workflow nobody reads. It says so in the run summary instead.
   *
   * Up to a point. `since` is when the reveals on disk were written, and past
   * three days of being turned away the run goes red after all: at that point the
   * page is out of date and the green run is the thing hiding it. That is not a
   * hypothesis — it ran green for five days while the page showed twelve-day-old
   * reveals, and what surfaced it was somebody looking at the page.
   *
   * Anything else still exits 1: a shape that changed, a parse that broke, a file
   * that would not write.
   */
  exitOnFailure('spoilers', err, 'nothing written; the archive keeps the reveals it had', {
    since: await writtenAt(path.join(DATA, 'spoilers.json')),
  });
});
