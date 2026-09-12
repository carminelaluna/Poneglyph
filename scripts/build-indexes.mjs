#!/usr/bin/env node
import { writeFile, readFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { indexOf, withoutRecorded } from './dedupe.mjs';
import { flip } from './matchups.mjs';
import { readDecks } from './deck-corpus.mjs';

const DATA = path.resolve('data');
const PUBLIC = path.resolve('public', 'data');
const log = (...m) => console.log('[indexes]', ...m);

const RECENT_DAYS = 90;

const SHARDS = 256;

function shardOf(key) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
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

const UNKNOWN_PLAYER = 'Player not recorded';
const UNKNOWN_EVENT = 'Event not recorded';

const named = (value, placeholder) => {
  const text = String(value ?? '').trim();
  if (!text || text.toLowerCase() === 'unknown') return placeholder;
  return text;
};

const ADOPTION_THRESHOLD = 10;
const ADOPTION_WINDOW_DAYS = 7;
const MIN_DISTINCT_CARDS = 3;

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

function groupSameDay(eras, era) {
  const existing = eras.find((e) => e.from === era.from && e.kind === era.kind);
  if (!existing) return [...eras, { ...era, codes: [era.code] }];
  existing.codes.push(era.code);
  existing.code = existing.codes.join(', ');
  existing.cards += era.cards;
  existing.peak = Math.max(existing.peak, era.peak);
  return eras;
}

async function writeRegion(region, decks, cardsById) {
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
    leaders[deck.leaderId] ??= {
      n: deck.leaderName,
      c: deck.colors,
      $: cardsById.get(deck.leaderId)?.priceLow ?? null,
    };
    for (const card of deck.cards) {
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
    x: eventKey(d),
    a: d.player,
    v: d.venue,
    k: d.tier,
    f: d.sampling === 'field' ? 1 : 0,
    o: d.source === 'topdecks' ? 1 : d.source === 'community' ? 2 : undefined,
    u: d.sourceUrl || undefined,
    z: d.organizer || undefined,
  }));

  const index = {
    generatedAt: new Date().toISOString(),
    region: region.id,
    regionLabel: region.label,
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
  index.archiveMonths = months;
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

  index.allRows = rows;
  return index;
}

const NOT_A_PLAYER = new Set([
  'na', 'n/a', 'unknown', 'none', 'null', 'nan', '-', '--', '?', '??',
  'anon', 'anonymous', 'player not recorded',
]);

const namedPlayer = (name) => {
  const text = String(name ?? '').trim();
  return text.length > 0 && !NOT_A_PLAYER.has(text.toLowerCase());
};

const playerSlugOf = (name) =>
  String(name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 64);

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

  await writeDirectories(events, players);

  await writeFile(path.join(PUBLIC, 'leaders.json'), JSON.stringify(leaders));
  await writeFile(path.join(PUBLIC, 'card-names.json'), JSON.stringify(cardNames));
}

async function writeMatchups() {
  const held = await load('matchups.json', null);
  const dir = path.join(PUBLIC, 'matchups');

  if (!held?.rows?.length) {
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
      new Set(rows.map((r) => `${r.d}|${r.e}`)).size,
      rows.filter((r) => r.p !== null && r.p <= 8).length,
      rows.filter((r) => r.p === 1).length,
      dates.at(-1),
      main,
      regions.size > 1 ? 'both' : [...regions][0],
    ]);
  }
  playerRows.sort((a, b) => b[2] - a[2] || b[4] - a[4] || a[1].localeCompare(b[1]));

  const newest = eventRows[0]?.[2] ?? null;
  const recentFrom = newest ? shiftDays(newest, -RECENT_DAYS) : null;
  const recentEvents = recentFrom ? eventRows.filter((r) => r[2] >= recentFrom) : eventRows;
  const olderEvents = recentFrom ? eventRows.filter((r) => r[2] < recentFrom) : [];

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

async function main() {
  const started = Date.now();

  const cards = await load('cards.json', []);
  const cardsById = new Map(cards.map((c) => [c.id, c]));

  const limitless = await readDecks(DATA);
  const tournaments = await load('tournaments.json', []);
  const venueById = new Map(tournaments.map((t) => [t.id, t.venue ?? 'unknown']));
  const tierById = new Map(tournaments.map((t) => [t.id, t.tier ?? 'local']));

  const en = (await load('decks-en.json', { decks: [] })).decks;
  const jp = (await load('decks-jp.json', { decks: [] })).decks;

  const west = limitless.map((d) => ({
    id: d.id,
    tournamentId: d.tournamentId,
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

  const topDecksEn = fromTopDecks(en);
  const { kept: deduped, dropped } = withoutRecorded(topDecksEn, indexOf(west));
  if (dropped.list || dropped.event) {
    log(
      `deduplicated ${dropped.list + dropped.event} English lists already recorded by ` +
        `Limitless (${dropped.list} the same fifty cards, ${dropped.event} the same event)`
    );
  }

  const community = (await load('decks-community.json', { decks: [] })).decks ?? [];
  const held = indexOf([...west, ...deduped, ...fromTopDecks(jp)]);
  const { kept: submitted, dropped: alsoHeld } = withoutRecorded(community, held);
  const alreadyHeld = alsoHeld.list + alsoHeld.event;
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

  await writeEntityShards([
    { id: 'en', index: built.en },
    { id: 'jp', index: built.jp },
  ]);

  await writeMatchups();

  await writeFile(
    path.join(DATA, 'decks-merged.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      counts: { english: english.length, japanese: japanese.length, deduplicated: dropped },
      decks: [...english, ...japanese].map(({ cards, ...d }) => ({
        ...d,
        eventId: eventKey(d),
        total: cards.reduce((n, c) => n + c.count, 0),
      })),
    })
  );

  await rm(path.join(PUBLIC, 'decks-index.json')).catch(() => {});
  await rm(path.join(PUBLIC, 'decks'), { recursive: true, force: true }).catch(() => {});

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
