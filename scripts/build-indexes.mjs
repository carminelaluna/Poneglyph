#!/usr/bin/env node
/**
 * Poneglyph — browser indexes for the metagame page.
 *
 *   node scripts/build-indexes.mjs
 *
 * There are two regions a player thinks in — **English** and **Japanese** — and
 * three upstream corpora. Limitless and Top Decks both cover English events, so
 * they belong in one index; splitting them into "West" and "English" described our
 * plumbing rather than the game.
 *
 * They are not, however, sampled the same way. Limitless publishes whole Swiss
 * fields; Top Decks publishes decks that placed. Merging them without saying so
 * would quietly turn a win rate into an artefact, so **sampling is recorded per
 * deck**, not per corpus:
 *
 *   - share      counted over every deck in the window
 *   - win rate   counted only over field-sampled decks, with its own sample size
 *
 * Reading this file is how you find out what a number on the metagame page means.
 *
 * It also writes data/decks-merged.json — the canonical, deduplicated deck set the
 * single-deck and player pages read, so those never disagree with the tables.
 *
 * Writes public/data/decks-{en,jp}-index.json, public/data/decks-{en,jp}/*.json and
 * data/decks-merged.json.
 */

import { writeFile, readFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { flip } from './matchups.mjs';

const DATA = path.resolve('data');
const PUBLIC = path.resolve('public', 'data');
const log = (...m) => console.log('[indexes]', ...m);

/** How much history the first payload carries — every default window fits inside. */
const RECENT_DAYS = 90;

/**
 * How many buckets the per-entity payloads are split into.
 *
 * The event, player and deck pages are rendered in the browser, because
 * prerendering all 37,000 of them costs 5.5 GB against GitHub Pages' 1 GB. Each
 * page therefore needs its own slice of the corpus, and there are two bad ways to
 * supply it: ship the whole region (362 KB gzipped, to draw one three-deck event)
 * or write one file per entity (37,000 files, rewritten twice a day by the deck
 * workflow — an unreadable diff and a heavy repo).
 *
 * The bucket count has to move with the corpus, because what it really sets is how
 * much a single page downloads. 64 was chosen at 21,000 decks and gave ~10 KB a
 * page; backfilling the Limitless history to 2023 took the corpus to four times
 * that, which would have made every event, player and deck page pull ~380 KB to
 * draw a handful of rows. 256 puts it back to ~95 KB raw, ~15 KB gzipped, and the
 * deck ingest rewrites 768 files instead of 83,000.
 */
const SHARDS = 256;

/**
 * Which bucket a key falls in — FNV-1a, chosen because it is eight lines with no
 * dependency and gives the same answer in Node and in the browser.
 *
 * **`src/lib/shards.ts` holds an identical copy** and the two must agree exactly,
 * or every lookup misses. It is duplicated rather than shared because this file is
 * a build script and that one ships to the browser.
 */
function shardOf(key) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  /* Three digits, because 256 buckets no longer fit in two: 005 and 255, never
     "5" beside "255". The width only has to match the copy in lib/shards.ts. */
  return String((hash >>> 0) % SHARDS).padStart(3, '0');
}

function shiftDays(day, by) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

const load = async (file, fallback = null) => {
  try {
    return JSON.parse(await readFile(path.join(DATA, file), 'utf8'));
  } catch {
    return fallback;
  }
};

/**
 * The identity of an event.
 *
 * Limitless gives every tournament a real id. Top Decks does not — it records a
 * venue and a date, and the venue names are generic: "Cardshop" appears on 509
 * different days and "LGS" on 246. Date plus name is therefore the best available
 * key, and it is honest about its limits: two different shops both calling
 * themselves "LGS" on the same day would collapse into one event here.
 */
const eventKey = (deck) =>
  deck.source === 'limitless'
    ? `l-${deck.tournamentId}`
    : `t-${deck.region.toLowerCase()}-${deck.date.slice(0, 10)}-${slugify(deck.eventName)}`;

const slugify = (text) =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);

/* ------------------------------------------------------- shared vocabulary */

const TIERS = [
  { id: 'worlds', label: 'Worlds' },
  { id: 'finals', label: 'Finals' },
  { id: 'championship', label: 'Championship' },
  { id: 'treasure', label: 'Treasure Cup' },
  { id: 'regional', label: 'Regional' },
  { id: 'store', label: 'Store / shop' },
  { id: 'qualifier', label: 'Qualifier' },
  { id: 'local', label: 'Local' },
];

/**
 * Placeholders for fields an upstream did not publish.
 *
 * A blank cell reads as a rendering bug; a named placeholder reads as "this was
 * not recorded", which is the true statement. They are deliberately obvious so
 * nobody mistakes one for real data.
 */
const UNKNOWN_PLAYER = 'Player not recorded';
const UNKNOWN_EVENT = 'Event not recorded';

const named = (value, placeholder) => {
  const text = String(value ?? '').trim();
  if (!text || text.toLowerCase() === 'unknown') return placeholder;
  return text;
};

/* ------------------------------------------------------------------- eras */

const ADOPTION_THRESHOLD = 10;
const ADOPTION_WINDOW_DAYS = 7;
const MIN_DISTINCT_CARDS = 3;

/**
 * When each set entered play in *this* corpus. Same three tests as the card-side
 * derivation: the set must first appear after the corpus starts, reach real
 * adoption, and arrive with several cards rather than one. Each region gets its
 * sets on its own date, so each derives its own eras from its own decks.
 */
function buildEras(decks) {
  if (decks.length < 100) return [];

  const rows = decks
    .filter((d) => d.date)
    .map((d) => {
      const ids = [d.leaderId, ...d.cards.map((c) => c.id)];
      return { day: d.date.slice(0, 10), ids, sets: new Set(ids.map((i) => i.split('-')[0])) };
    })
    .sort((a, b) => a.day.localeCompare(b.day));
  if (rows.length === 0) return [];

  const corpusStart = rows[0].day;
  const firstSeen = new Map();
  const distinct = new Map();
  for (const row of rows) {
    for (const set of row.sets) if (!firstSeen.has(set)) firstSeen.set(set, row.day);
    for (const id of row.ids) {
      const set = id.split('-')[0];
      if (!distinct.has(set)) distinct.set(set, new Set());
      distinct.get(set).add(id);
    }
  }

  const days = [...new Set(rows.map((r) => r.day))].sort();
  const dayMs = days.map((d) => Date.parse(`${d}T00:00:00Z`));
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const totalByDay = new Array(days.length).fill(0);
  const hitsBySet = new Map();

  for (const row of rows) {
    const i = dayIndex.get(row.day);
    totalByDay[i]++;
    for (const set of row.sets) {
      let hits = hitsBySet.get(set);
      if (!hits) {
        hits = new Array(days.length).fill(0);
        hitsBySet.set(set, hits);
      }
      hits[i]++;
    }
  }

  const peakAdoption = (set) => {
    const hits = hitsBySet.get(set);
    if (!hits) return 0;
    let peak = 0;
    for (let start = 0; start < days.length; start++) {
      const cutoff = dayMs[start] + ADOPTION_WINDOW_DAYS * 86_400_000;
      let total = 0;
      let hit = 0;
      for (let i = start; i < days.length && dayMs[i] < cutoff; i++) {
        total += totalByDay[i];
        hit += hits[i];
      }
      if (total < 30) continue;
      const share = (hit / total) * 100;
      if (share > peak) peak = share;
    }
    return peak;
  };

  return [...firstSeen.entries()]
    .filter(([set, day]) => /^(OP|EB|PRB|ST)\d+$/.test(set) && day > corpusStart)
    .filter(([set]) => (distinct.get(set)?.size ?? 0) >= MIN_DISTINCT_CARDS)
    .map(([set, day]) => ({ set, day, peak: peakAdoption(set), cards: distinct.get(set).size }))
    .filter((e) => e.peak >= ADOPTION_THRESHOLD)
    .map(({ set, day, peak, cards }) => ({
      code: set.replace(/^([A-Z]+)(\d+)$/, '$1-$2'),
      set,
      from: day,
      kind: set.startsWith('ST') ? 'Starter deck' : 'Expansion',
      peak: +peak.toFixed(1),
      cards,
    }))
    .reduce(groupSameDay, [])
    .map((era) => ({
      ...era,
      decks: decks.filter((d) => d.date && d.date.slice(0, 10) >= era.from).length,
    }))
    .sort((a, b) => b.from.localeCompare(a.from));
}

/** Starter decks ship in waves; three identical dates are one question. */
function groupSameDay(eras, era) {
  const existing = eras.find((e) => e.from === era.from && e.kind === era.kind);
  if (!existing) return [...eras, { ...era, codes: [era.code] }];
  existing.codes.push(era.code);
  existing.code = existing.codes.join(', ');
  existing.cards += era.cards;
  existing.peak = Math.max(existing.peak, era.peak);
  return eras;
}

/* ---------------------------------------------------------------- writing */

async function writeRegion(region, decks, cardsById) {
  /*
   * A region with nothing in it used to fail eleven lines further down, inside
   * `shiftDays(index.window.to, ...)`, as `Invalid time value` — a message naming
   * neither the region nor the file that was supposed to fill it. That is what a
   * scheduled run showed the morning Top Decks answered the runner with empty
   * pages: the ingest wrote nothing over both of its corpora, and the first thing
   * to notice was a date constructor.
   *
   * It stops here instead, and says which corpus is missing. Writing an empty
   * index would be worse than stopping: it is a live payload, and the metagame
   * page would report that region as having no results at all.
   */
  if (decks.length === 0) {
    throw new Error(
      `${region.label} has no decks — ${region.sources.join(' and ')} produced nothing. ` +
        `Refusing to write an empty ${region.file}-index.json over a good one.`
    );
  }

  const leaders = {};
  const cardNames = {};
  const byLeader = new Map();

  for (const deck of decks) {
    /* `$` for the same reason as below: a deck's total includes its Leader. */
    leaders[deck.leaderId] ??= {
      n: deck.leaderName,
      c: deck.colors,
      $: cardsById.get(deck.leaderId)?.priceLow ?? null,
    };
    for (const card of deck.cards) {
      /*
       * Name, category, and the lowest listed price.
       *
       * The price is here rather than in a payload of its own because every page
       * that wants to total a decklist already fetches this file, and the third
       * element costs about 4 KB gzipped across the whole archive — against 176 KB
       * for the card index, which is the only other place a price lives.
       *
       * `null` when the price source has none, and the pages that add these up say
       * how many they could not price rather than treating a missing figure as 0.
       */
      cardNames[card.id] ??= [
        cardsById.get(card.id)?.name ?? card.id,
        card.category,
        cardsById.get(card.id)?.priceLow ?? null,
      ];
    }
    if (!byLeader.has(deck.leaderId)) byLeader.set(deck.leaderId, {});
    byLeader.get(deck.leaderId)[deck.id] = deck.cards.map((c) => [c.id, c.count]);
  }

  const dates = decks.map((d) => d.date?.slice(0, 10)).filter(Boolean).sort();
  const fieldDecks = decks.filter((d) => d.sampling === 'field').length;

  const rows = decks.map((d) => ({
    i: d.id,
    l: d.leaderId,
    d: d.date.slice(0, 10),
    p: d.placing,
    w: d.record?.wins ?? 0,
    s: d.record?.losses ?? 0,
    t: d.record?.ties ?? 0,
    n: d.players ?? 0,
    e: d.eventName,
    /* Event identity, so a table row can link to the event without a lookup table. */
    x: eventKey(d),
    a: d.player,
    v: d.venue,
    k: d.tier,
    /* 1 when this deck came from a whole-field sample. */
    f: d.sampling === 'field' ? 1 : 0,
    /*
     * Source and its permalink, for the event page's attribution.
     *
     * `f` happens to imply this today — every Limitless row is a whole field and
     * every Top Decks row is winners-only — but that is a coincidence of the two
     * upstreams we have, not a rule. Deriving attribution from a sampling flag
     * would credit the wrong site the day a source publishes full fields.
     *
     * Both are omitted on Limitless rows, and JSON.stringify drops undefined, so
     * they cost nothing there. The 11,636 Top Decks rows share just 40 distinct
     * URLs; they are written inline rather than interned because interning event
     * and player names made these files *larger* — gzip already collapses
     * repetition, and a lookup table only adds indirection.
     */
    o: d.source === 'topdecks' ? 1 : undefined,
    u: d.sourceUrl || undefined,
  }));

  const index = {
    generatedAt: new Date().toISOString(),
    region: region.id,
    regionLabel: region.label,
    /* Mixed corpora: sampling is per deck, in the `f` column. */
    sampling: fieldDecks === decks.length ? 'field' : fieldDecks === 0 ? 'winners' : 'mixed',
    fieldDecks,
    sources: region.sources,
    window: { from: dates[0] ?? null, to: dates.at(-1) ?? null },
    eras: buildEras(decks),
    tiers: TIERS,
    leaders,
    cards: cardNames,
    decks: rows,
  };

  const dir = path.join(PUBLIC, region.file);
  await mkdir(dir, { recursive: true });

  /*
   * The corpus is split by recency rather than shipped whole. Every window the page
   * offers by default — 7 to 90 days — is answered from the first file; anything
   * older reaches past it into the archive.
   *
   * **The archive is a file per month, and it used to be one file.** That was the
   * right shape at 21,000 decks, where the whole thing was 253 KB gzipped and
   * "All" was the only realistic reason to want it. Backfilling the Limitless
   * history made it 1.1 MB — and made old eras worth opening, which is the click
   * it exists for. Paying 1.1 MB to read three months of 2024 is the cost falling
   * on exactly the reader the backfill was for.
   *
   * A month is the unit because every window here is a date range, so a range
   * selects its months by arithmetic and needs no manifest to interpret. The
   * median month is 21 KB gzipped and the largest is 77 KB, so an era is one to
   * three requests; "All" is still the whole 1.1 MB, which is what "all" costs,
   * but it arrives in parallel and each piece is cached on its own.
   */
  const recentFrom = shiftDays(index.window.to, -RECENT_DAYS);
  const recent = rows.filter((r) => r.d >= recentFrom);
  const older = rows.filter((r) => r.d < recentFrom);

  const byMonth = new Map();
  for (const row of older) {
    const month = row.d.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(row);
  }
  const months = [...byMonth.keys()].sort();

  index.decks = recent;
  index.recentFrom = recentFrom;
  index.archived = older.length;
  /*
   * Which months exist, so the loader asks only for files that are there. Without
   * it a window reaching before the corpus starts would 404 — and on a static host
   * a 404 is answered with the whole of 404.html, as JSON, which fails to parse.
   */
  index.archiveMonths = months;
  /* The whole corpus, so summaries do not report the recent slice as the total. */
  index.totalDecks = rows.length;

  const json = JSON.stringify(index);
  await writeFile(path.join(PUBLIC, `${region.file}-index.json`), json);

  const archiveDir = path.join(PUBLIC, `${region.file}-archive`);
  await mkdir(archiveDir, { recursive: true });
  const stale = (await readdir(archiveDir).catch(() => [])).filter(
    (f) => f.endsWith('.json') && !byMonth.has(f.slice(0, -5))
  );
  await Promise.all(stale.map((f) => rm(path.join(archiveDir, f))));
  await Promise.all(
    [...byMonth.entries()].map(([month, decks]) =>
      writeFile(path.join(archiveDir, `${month}.json`), JSON.stringify({ month, decks }))
    )
  );
  /* The single file this replaced, removed so no checkout serves a stale copy. */
  await rm(path.join(PUBLIC, `${region.file}-archive.json`), { force: true });

  const existing = await readdir(dir).catch(() => []);
  const wanted = new Set([...byLeader.keys()].map((id) => `${id}.json`));
  await Promise.all(
    existing.filter((f) => f.endsWith('.json') && !wanted.has(f)).map((f) => rm(path.join(dir, f)))
  );
  await Promise.all(
    [...byLeader.entries()].map(([leaderId, lists]) =>
      writeFile(path.join(dir, `${leaderId}.json`), JSON.stringify(lists))
    )
  );

  log(
    `${region.label.padEnd(9)} ${String(decks.length).padStart(6)} decks ` +
      `(${fieldDecks} field, ${decks.length - fieldDecks} winners) · ` +
      `${index.eras.length} eras · ${byLeader.size} archetypes`
  );
  log(
    `          index ${String(recent.length).padStart(6)} recent = ` +
      `${(Buffer.byteLength(json) / 1024).toFixed(0)} KB · archive ${older.length} older ` +
      `in ${months.length} months`
  );

  /*
   * The whole row set, for the entity shards below. `index.decks` was narrowed to
   * the recent slice a few lines up, and it has already been serialised, so this
   * neither changes what was written nor what regions.json reads.
   */
  index.allRows = rows;
  return index;
}

/* --------------------------------------------------------- entity shards */

/**
 * Names that are not people. `NA` is the single most common value in the raw data
 * (172 rows) and would otherwise top every leaderboard. Must match the copy in
 * src/lib/meta.ts.
 */
const NOT_A_PLAYER = new Set([
  'na', 'n/a', 'unknown', 'none', 'null', 'nan', '-', '--', '?', '??',
  'anon', 'anonymous', 'player not recorded',
]);

const namedPlayer = (name) => {
  const text = String(name ?? '').trim();
  return text.length > 0 && !NOT_A_PLAYER.has(text.toLowerCase());
};

/**
 * URL form of a player name — **must match `playerSlug` in src/lib/meta.ts**, or a
 * shard lookup lands in the wrong bucket and the page reads as "player not found".
 *
 * Deliberately not the `slugify` above: that one truncates at 48 characters and
 * this one at 64, so reusing it would silently break the longest handles.
 *
 * The combining-marks range is written as an escape rather than as literal
 * diacritics. It is the same set either way, but a literal is invisible in a diff —
 * which is exactly how a backspace character got into three regexes in this repo.
 */
const playerSlugOf = (name) =>
  String(name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 64);

/**
 * Per-entity payloads for the event, player and deck pages.
 *
 * Those three are rendered in the browser rather than prerendered, so each needs
 * its slice of the corpus at request time. Rows are the same terse shape the
 * metagame index already uses, with `g` added for the region — a player can appear
 * in both, and a deck page needs to know which archetype file to read.
 */
async function writeEntityShards(regions) {
  const events = new Map();
  const players = new Map();
  const decksById = new Map();
  const leaders = {};
  const cardNames = {};

  const push = (map, key, row) => {
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  };

  for (const { id, index } of regions) {
    Object.assign(leaders, index.leaders);
    Object.assign(cardNames, index.cards);
    for (const base of index.allRows) {
      const row = { ...base, g: id };
      decksById.set(row.i, row);
      if (row.x) push(events, row.x, row);
      if (namedPlayer(row.a)) {
        const slug = playerSlugOf(row.a);
        if (slug) push(players, slug, row);
      }
    }
  }

  const write = async (name, entries) => {
    const buckets = new Map();
    for (const [key, value] of entries) {
      const bucket = shardOf(key);
      const held = buckets.get(bucket) ?? {};
      held[key] = value;
      buckets.set(bucket, held);
    }

    const dir = path.join(PUBLIC, name);
    await mkdir(dir, { recursive: true });

    /* Drop buckets an earlier run wrote that this one no longer fills. */
    const wanted = new Set([...buckets.keys()].map((b) => `${b}.json`));
    const existing = await readdir(dir).catch(() => []);
    await Promise.all(
      existing.filter((f) => f.endsWith('.json') && !wanted.has(f)).map((f) => rm(path.join(dir, f)))
    );

    let bytes = 0;
    await Promise.all(
      [...buckets.entries()].map(([bucket, held]) => {
        const json = JSON.stringify(held);
        bytes += Buffer.byteLength(json);
        return writeFile(path.join(dir, `${bucket}.json`), json);
      })
    );

    log(
      `  ${name.padEnd(8)} ${String(entries.length).padStart(6)} in ${buckets.size} shards · ` +
        `${(bytes / 1024 / 1024).toFixed(1)} MB · ${(bytes / buckets.size / 1024).toFixed(0)} KB each`
    );
  };

  await write('events', [...events.entries()]);
  await write('players', [...players.entries()]);
  await write('deck', [...decksById.entries()].map(([id, row]) => [id, row]));

  /* The same two groupings, listed rather than sharded — see below. */
  await writeDirectories(events, players);

  /*
   * Shared lookups every shell needs: archetype names and colours, and card names
   * for a decklist. Both are small and change rarely, and pulling them from the
   * region index instead would cost 109 KB to render one page.
   */
  await writeFile(path.join(PUBLIC, 'leaders.json'), JSON.stringify(leaders));
  await writeFile(path.join(PUBLIC, 'card-names.json'), JSON.stringify(cardNames));
}

/**
 * Leader against Leader, one file per archetype.
 *
 * `ingest-matchups.mjs` records every match in a Limitless event as a pair of
 * Leaders and a result. Split per archetype, because that is how the question gets
 * asked — "how does this deck do against that one" is read on one archetype's page,
 * and shipping thirty thousand matches so a page can find its own four hundred
 * would cost hundreds of kilobytes to draw one table.
 *
 * Each file is written from **that Leader's side**: `r` is 1 when this Leader won.
 * A match therefore appears in two files, once from each end. That is a copy of
 * about twelve bytes; the alternative is every reader doing the flip themselves and
 * one of them eventually getting it backwards.
 *
 * Mirrors are dropped by the ingest: a deck beats itself half the time by
 * construction, and a row saying so would be arithmetic dressed as a result.
 */
async function writeMatchups() {
  const held = await load('matchups.json', null);
  const dir = path.join(PUBLIC, 'matchups');

  if (!held?.rows?.length) {
    /* Not an error: a checkout that has never run the matchup ingest has none. */
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    await rm(path.join(PUBLIC, 'matchups.json')).catch(() => {});
    return null;
  }

  const byLeader = new Map();
  const push = (leader, row) => {
    const list = byLeader.get(leader);
    if (list) list.push(row);
    else byLeader.set(leader, [row]);
  };

  for (const [day, a, b, result] of held.rows) {
    /* 1 won, 0 lost, 2 drew — flipped for the second Leader's own file. The flip
       is imported rather than written again here: two copies of it is how one of
       them ends up backwards, and a backwards matchup reads as a real result. */
    push(a, [day, b, result]);
    push(b, [day, a, flip(result)]);
  }

  await mkdir(dir, { recursive: true });
  const wanted = new Set([...byLeader.keys()].map((id) => `${id}.json`));
  const existing = await readdir(dir).catch(() => []);
  await Promise.all(
    existing.filter((f) => f.endsWith('.json') && !wanted.has(f)).map((f) => rm(path.join(dir, f)))
  );

  let bytes = 0;
  await Promise.all(
    [...byLeader.entries()].map(([leader, rows]) => {
      const json = JSON.stringify({ days: held.days, rows });
      bytes += Buffer.byteLength(json);
      return writeFile(path.join(dir, `${leader}.json`), json);
    })
  );

  const summary = {
    generatedAt: held.generatedAt,
    matches: held.rows.length,
    archetypes: byLeader.size,
    tournaments: held.counts?.tournaments ?? 0,
    pending: held.counts?.pending ?? 0,
    from: [...(held.days ?? [])].sort()[0] ?? null,
    to: [...(held.days ?? [])].sort().at(-1) ?? null,
  };
  await writeFile(path.join(PUBLIC, 'matchups.json'), JSON.stringify(summary));

  log(
    `  matchups  ${summary.matches.toLocaleString('en-US')} matches · ` +
      `${byLeader.size} archetypes · ${(bytes / 1024).toFixed(0)} KB · ` +
      `${(bytes / byLeader.size / 1024).toFixed(1)} KB each`
  );
  return summary;
}

/**
 * Two lists: every recorded tournament, and every recorded player.
 *
 * Both existed only as leaf pages before this. There are 7,163 events and 8,709
 * players in the corpus and the only way to reach one was to already be looking at
 * a deck that linked to it — /events is Bandai's announced calendar, which is a
 * different thing entirely, and there was no /players at all.
 *
 * Written as arrays rather than objects, and split by recency the same way the
 * metagame index is. Whole, either list is around 170 KB gzipped for a page most
 * people open to look at the last month or at the regulars; the split puts the tail
 * behind one deliberate click. Positions are documented here and read back in
 * `lib/directory.ts` — the two must agree, and a test compares them.
 *
 *   event  [id, name, date, region, tier, venue, recorded, entrants, winnerLeader]
 *   player [slug, name, results, events, top8, firsts, last, mainLeader, regions]
 */
/*
 * What counts as a regular, and therefore how big /players is on arrival.
 *
 * It was 2 when the corpus held 8,686 players and the list came to 45 KB gzipped.
 * Backfilling the Limitless history took it to 18,960, of whom 9,449 appear exactly
 * once and 3,115 exactly twice — so "two or more" stopped meaning regular and the
 * payload trebled to 134 KB on a page that is not even the busiest one.
 *
 * Five puts it back to ~54 KB and to 3,691 people who genuinely turn up. Nobody is
 * lost: the rest are one fetch away behind the count line, and their own page never
 * depended on this list.
 */
const DIRECTORY_MIN_RESULTS = 5;

async function writeDirectories(events, players) {
  const eventRows = [];
  for (const [id, rows] of events) {
    const head = rows[0];
    const winner = rows.find((r) => r.p === 1);
    eventRows.push([
      id,
      head.e,
      head.d,
      head.g,
      head.k ?? 'local',
      head.v ?? 'unknown',
      rows.length,
      /* Entrants as reported; 0 means no source recorded one, not an empty room. */
      Math.max(0, ...rows.map((r) => r.n ?? 0)),
      winner?.l ?? '',
    ]);
  }
  eventRows.sort((a, b) => b[2].localeCompare(a[2]) || b[6] - a[6]);

  const playerRows = [];
  for (const [slug, rows] of players) {
    const spellings = new Map();
    const archetypes = new Map();
    const regions = new Set();
    for (const row of rows) {
      spellings.set(row.a, (spellings.get(row.a) ?? 0) + 1);
      archetypes.set(row.l, (archetypes.get(row.l) ?? 0) + 1);
      regions.add(row.g);
    }
    const name = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const main = [...archetypes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const dates = rows.map((r) => r.d).sort();
    playerRows.push([
      slug,
      name,
      rows.length,
      /* Distinct day-plus-event: one event can yield several recorded lists. */
      new Set(rows.map((r) => `${r.d}|${r.e}`)).size,
      rows.filter((r) => r.p !== null && r.p <= 8).length,
      rows.filter((r) => r.p === 1).length,
      dates.at(-1),
      main,
      regions.size > 1 ? 'both' : [...regions][0],
    ]);
  }
  /* Most recorded results first: the leaderboard reading of "who plays here". */
  playerRows.sort((a, b) => b[2] - a[2] || b[4] - a[4] || a[1].localeCompare(b[1]));

  const newest = eventRows[0]?.[2] ?? null;
  const recentFrom = newest ? shiftDays(newest, -RECENT_DAYS) : null;
  const recentEvents = recentFrom ? eventRows.filter((r) => r[2] >= recentFrom) : eventRows;
  const olderEvents = recentFrom ? eventRows.filter((r) => r[2] < recentFrom) : [];

  /*
   * A player with one recorded result is most of the list and none of the
   * interest — 5,838 of 8,709 appear exactly once. They stay reachable: their page
   * is unchanged, and the directory fetches the rest of the list when someone
   * searches for a name that is not in the first file.
   */
  const regulars = playerRows.filter((r) => r[2] >= DIRECTORY_MIN_RESULTS);
  const occasional = playerRows.filter((r) => r[2] < DIRECTORY_MIN_RESULTS);

  const files = [
    ['tournaments-index.json', { generatedAt: new Date().toISOString(), total: eventRows.length, recentFrom, archived: olderEvents.length, events: recentEvents }],
    ['tournaments-archive.json', { events: olderEvents }],
    ['players-index.json', { generatedAt: new Date().toISOString(), total: playerRows.length, minResults: DIRECTORY_MIN_RESULTS, archived: occasional.length, players: regulars }],
    ['players-archive.json', { players: occasional }],
  ];

  for (const [name, payload] of files) {
    const json = JSON.stringify(payload);
    await writeFile(path.join(PUBLIC, name), json);
    log(`  ${name.padEnd(26)} ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB`);
  }
}

/* ------------------------------------------------------------------- main */

async function main() {
  const started = Date.now();

  const cards = await load('cards.json', []);
  const cardsById = new Map(cards.map((c) => [c.id, c]));

  const limitless = await load('decks.json', []);
  const tournaments = await load('tournaments.json', []);
  const venueById = new Map(tournaments.map((t) => [t.id, t.venue ?? 'unknown']));
  const tierById = new Map(tournaments.map((t) => [t.id, t.tier ?? 'local']));

  const en = (await load('decks-en.json', { decks: [] })).decks;
  const jp = (await load('decks-jp.json', { decks: [] })).decks;

  /* Limitless: whole Swiss fields. */
  const west = limitless.map((d) => ({
    id: d.id,
    tournamentId: d.tournamentId,
    /* Limitless dates carry a time; everything else is a day. One shape downstream. */
    date: d.date.slice(0, 10),
    leaderId: d.leaderId,
    leaderName: d.leaderName,
    colors: d.colors,
    placing: d.placing,
    record: d.record,
    players: d.tournamentPlayers ?? 0,
    eventName: named(d.tournamentName, UNKNOWN_EVENT),
    player: named(d.player, UNKNOWN_PLAYER),
    venue: venueById.get(d.tournamentId) ?? 'unknown',
    tier: tierById.get(d.tournamentId) ?? 'local',
    cards: d.cards,
    sampling: 'field',
    region: 'EN',
    source: 'limitless',
  }));

  /* Top Decks: decks that placed, on paper. */
  const fromTopDecks = (decks) =>
    decks.map((d) => ({
      id: d.id,
      tournamentId: null,
      date: d.date.slice(0, 10),
      leaderId: d.leaderId,
      leaderName: d.leaderName,
      colors: d.colors,
      placing: d.placing,
      record: d.record,
      players: 0,
      eventName: named(d.eventName, UNKNOWN_EVENT),
      player: named(d.player, UNKNOWN_PLAYER),
      venue: 'offline',
      tier: d.tier ?? 'local',
      cards: d.cards,
      sampling: 'winners',
      region: d.region,
      source: 'topdecks',
      eventType: d.eventType,
      sourceUrl: d.sourceUrl,
    }));

  /*
   * Limitless and Top Decks both cover 2026 English events, so 223 lists appear
   * twice. A duplicate is the same player, on the same day, with the same Leader and
   * the same fifty cards — anything short of that is kept, because a player can
   * genuinely bring one deck to two events in a day. Limitless wins the tie: it
   * carries the field size, the Swiss record and the real event name.
   */
  const listKey = (d) =>
    [
      d.date.slice(0, 10),
      d.player.trim().toLowerCase(),
      d.leaderId,
      d.cards
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((c) => `${c.count}x${c.id}`)
        .join(','),
    ].join('|');

  const limitlessKeys = new Set(west.map(listKey));
  const topDecksEn = fromTopDecks(en);
  const deduped = topDecksEn.filter((d) => !limitlessKeys.has(listKey(d)));
  const dropped = topDecksEn.length - deduped.length;
  if (dropped) log(`deduplicated ${dropped} English lists already recorded by Limitless`);

  /*
   * Approved organizer submissions — the third source, written by
   * ingest-submissions.mjs. Absent on a checkout that has never run it, and that is
   * not an error: the file simply is not there yet.
   *
   * Deduplicated against both of the others, and last in the tie. A local organizer
   * uploading an event Limitless already published should not double its decks, and
   * where the two disagree the automated source is the one that can be re-checked.
   */
  const community = (await load('decks-community.json', { decks: [] })).decks ?? [];
  const knownKeys = new Set([...west, ...deduped, ...fromTopDecks(jp)].map(listKey));
  const submitted = community.filter((d) => !knownKeys.has(listKey(d)));
  const alreadyHeld = community.length - submitted.length;
  if (community.length) {
    log(
      `${submitted.length} submitted decks folded in` +
        (alreadyHeld ? `, ${alreadyHeld} already recorded elsewhere` : '')
    );
  }

  const byRegion = (region) => submitted.filter((d) => d.region === region);

  const english = [...west, ...deduped, ...byRegion('EN')].sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  const japanese = [...fromTopDecks(jp), ...byRegion('JP')].sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  await mkdir(PUBLIC, { recursive: true });

  const built = {};
  built.en = await writeRegion(
    {
      id: 'EN',
      label: 'English',
      file: 'decks-en',
      sources: ['Limitless', 'One Piece Top Decks'],
    },
    english,
    cardsById
  );
  built.jp = await writeRegion(
    { id: 'JP', label: 'Japanese', file: 'decks-jp', sources: ['One Piece Top Decks'] },
    japanese,
    cardsById
  );

  /*
   * Per-entity payloads for the three pages the browser renders. Written from both
   * regions at once because a player can compete in either, so the slice for one
   * name is not a property of a single corpus.
   */
  await writeEntityShards([
    { id: 'en', index: built.en },
    { id: 'jp', index: built.jp },
  ]);

  /*
   * Leader-against-Leader records, from the pairings the matchup ingest reads.
   * Absent on a checkout that has never run it, which is why this returns null
   * rather than failing — the archetype pages say so and everything else is
   * unaffected.
   */
  await writeMatchups();

  /*
   * One canonical set for the pages that resolve a single deck or a player —
   * **without the card lists**.
   *
   * This file is imported by lib/decks.ts, so it is read at build time by `tsc` and
   * by the bundler, and `resolveJsonModule` infers a literal type for every key in
   * it. Carrying the fifty cards of 69,708 decks made it 83 MB, at which size
   * `tsc --noEmit` dies with "Ineffective mark-compacts near heap limit" and takes
   * the build with it. Without them it is a seventh of that.
   *
   * Nothing is lost: no page reads a card list from here. The archetype pages read
   * public/data/decks-{region}/{leaderId}.json and the deck page reads its shard,
   * both of which are fetched rather than bundled — which is the whole reason they
   * exist. What this file is for is resolving *which* deck, not what is in it.
   */
  await writeFile(
    path.join(DATA, 'decks-merged.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      counts: { english: english.length, japanese: japanese.length, deduplicated: dropped },
      decks: [...english, ...japanese].map(({ cards, ...d }) => ({
        ...d,
        eventId: eventKey(d),
        /* The one thing the card list was read for here: how many it holds. */
        total: cards.reduce((n, c) => n + c.count, 0),
      })),
    })
  );

  /* The old three-region index is gone; remove it so nothing serves stale data. */
  await rm(path.join(PUBLIC, 'decks-index.json')).catch(() => {});
  await rm(path.join(PUBLIC, 'decks'), { recursive: true, force: true }).catch(() => {});

  /*
   * When each set arrived, newest first — one flat list across both regions.
   *
   * The eras are already derived per region and already date-ordered; this only
   * flattens the ones that share a day (`codes` holds three starter decks released
   * together) and keeps the earliest date a set appears under, since Japanese
   * results usually see a set first.
   *
   * It is a build-time file so the home page can read it. That page is a server
   * component and must not import from public/data — see the note at the top of
   * this script.
   *
   * These are **play dates, not print dates**: a set is here from when it showed up
   * in recorded results. Anything reading it should say "newest" rather than claim a
   * release date.
   */
  const releaseByCode = new Map();
  for (const region of Object.values(built)) {
    for (const era of region.eras ?? []) {
      for (const code of era.codes?.length ? era.codes : [era.code]) {
        const held = releaseByCode.get(code);
        if (!held || era.from < held.from) {
          releaseByCode.set(code, { code, from: era.from, kind: era.kind });
        }
      }
    }
  }
  const releases = [...releaseByCode.values()].sort((a, b) => b.from.localeCompare(a.from));
  log(`${releases.length} set releases dated, newest ${releases[0]?.code} on ${releases[0]?.from}`);

  await writeFile(
    path.join(DATA, 'regions.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        releases,
        regions: Object.values(built).map((i) => ({
          id: i.region,
          label: i.regionLabel,
          decks: i.totalDecks,
          recent: i.decks.length,
          archived: i.archived,
          fieldDecks: i.fieldDecks,
          sampling: i.sampling,
          window: i.window,
          eras: i.eras.length,
          sources: i.sources,
        })),
      },
      null,
      2
    )
  );

  log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  for (const index of Object.values(built)) {
    log(`  ${index.regionLabel}: eras ${index.eras.map((e) => e.code).join(', ') || 'none'}`);
  }
}

main().catch((err) => {
  console.error('[indexes] FAILED —', err.message);
  process.exit(1);
});
