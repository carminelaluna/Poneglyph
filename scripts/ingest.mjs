#!/usr/bin/env node
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { SOURCES, RULES_SOURCES } from './sources.mjs';
import { appendPrices } from './price-history.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const LANG = flag('lang', 'english');
const OUT_DIR = path.resolve(flag('out', 'data'));
const WITH_PRICES = !has('no-prices');

const MIN_EXPECTED_CARDS = 1500;

const log = (...m) => console.log('[ingest]', ...m);

async function getJson(url, { retries = 3, optional = false } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'poneglyph-ingest/1.0' },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.trimStart().startsWith('<')) throw new Error('HTML response, not JSON');
      return JSON.parse(text);
    } catch (err) {
      if (attempt === retries) {
        if (optional) return null;
        throw new Error(`${url} failed after ${retries} attempts: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 400 * attempt ** 2));
    }
  }
  return null;
}

async function pooled(items, limit, worker) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) await worker(items[cursor++]);
    })
  );
}

const baseId = (id) => String(id).replace(/_[a-z]\d*$/i, '');

function variantLabel(id) {
  const m = String(id).match(/_([a-z])(\d*)$/i);
  if (!m) return 'Regular';
  const kind = m[1].toLowerCase() === 'p' ? 'Alternate Art' : 'Reprint';
  return m[2] && m[2] !== '1' ? `${kind} ${m[2]}` : kind;
}

function versionLabel(id, position) {
  return position === 0 ? id : `${baseId(id)} V${position + 1}`;
}

const RARITY_NAMES = {
  C: 'Common', UC: 'Uncommon', R: 'Rare', SR: 'Super Rare', SEC: 'Secret Rare',
  L: 'Leader', P: 'Promo', PR: 'Promo', TR: 'Treasure Rare', SP: 'Special Card',
  Common: 'Common', Uncommon: 'Uncommon', Rare: 'Rare', SuperRare: 'Super Rare',
  SecretRare: 'Secret Rare', Leader: 'Leader', Promo: 'Promo',
  TreasureRare: 'Treasure Rare', Special: 'Special Card',
};
const RARITY_CODES = {
  Common: 'C', Uncommon: 'UC', Rare: 'R', 'Super Rare': 'SR', 'Secret Rare': 'SEC',
  Leader: 'L', Promo: 'P', 'Treasure Rare': 'TR', 'Special Card': 'SP',
};
const rarityName = (r) => RARITY_NAMES[r] ?? (r ? String(r) : 'Unknown');

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  '#39': "'", '#34': '"', '#160': ' ',
};
function decode(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/&(#?\w+);/g, (whole, code) => ENTITIES[code] ?? whole).trim();
}

function keywordsFromEffect(effect) {
  if (!effect) return [];
  return [...new Set([...effect.matchAll(/\[([^\]]{1,32})\]/g)].map((m) => m[1].trim()))];
}

const GROUP_ORDER = {
  'Booster Set': 1, 'Extra Booster': 2, 'Premium Booster': 3,
  'Starter Deck': 4, Promo: 5, Other: 6,
};

function fallbackCode(cardIds, rawTitle) {
  const counts = new Map();
  for (const id of cardIds) {
    const prefix = String(baseId(id)).split('-')[0].replace(/^([A-Za-z]+)(\d+)$/, '$1-$2');
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  const [top, hits] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (top && hits / cardIds.length >= 0.8) return top;
  const word = (rawTitle ?? 'SET').split(/\s+/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^PROMO/.test(word) ? 'PROMO' : word.slice(0, 6) || 'SET';
}

function normalisePack(pack, cardIds) {
  const parts = pack.title_parts ?? {};
  const code = parts.label ?? fallbackCode(cardIds, pack.raw_title);
  const name = decode(parts.title ?? pack.raw_title ?? code);
  let group = 'Other';
  if (/^ST/i.test(code)) group = 'Starter Deck';
  else if (/^OP/i.test(code)) group = 'Booster Set';
  else if (/^EB/i.test(code)) group = 'Extra Booster';
  else if (/^PRB/i.test(code)) group = 'Premium Booster';
  else if (/promo/i.test(pack.raw_title ?? '') || /^P/i.test(code)) group = 'Promo';

  const n = Number(String(code).match(/(\d+)/)?.[1] ?? 999);
  return {
    id: String(pack.id),
    code,
    name,
    prefix: parts.prefix ?? '',
    group,
    rawTitle: decode(pack.raw_title ?? ''),
    sortKey: `${GROUP_ORDER[group]}-${String(9999 - n).padStart(4, '0')}`,
    slug: String(code).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
  };
}

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const price = (v) => {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
};

const pick = (obj, ...keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

async function loadSpine() {
  const src = SOURCES.punkRecords;
  log('stage 1/5  punk-records spine...');
  const [manifest, packs, cards] = await Promise.all([
    getJson(src.manifestUrl(LANG), { optional: true }),
    getJson(src.packsUrl(LANG)),
    getJson(src.cardsByIdUrl(LANG)),
  ]);
  const ids = Object.keys(cards);
  if (ids.length < MIN_EXPECTED_CARDS) {
    throw new Error(`spine has only ${ids.length} printings — refusing to overwrite`);
  }
  const built = manifest?.generated_at
    ? new Date(manifest.generated_at * 1000).toISOString().slice(0, 10)
    : 'unknown';
  log(`  ${ids.length} printings, ${Object.keys(packs).length} packs (upstream built ${built})`);
  return { manifest, packs, cards };
}

async function loadBulkEffects(packIds) {
  log('stage 2/5  vegapull-records bulk rules text...');
  const effects = new Map();
  let packsHit = 0;
  await pooled(packIds, 8, async (packId) => {
    const rows = await getJson(SOURCES.vegapullRecords.packUrl(packId, LANG), {
      retries: 2, optional: true,
    });
    if (!Array.isArray(rows)) return;
    packsHit++;
    for (const row of rows) {
      if (!row?.id) continue;
      effects.set(row.id, {
        effect: row.effect ?? null,
        trigger: row.trigger ?? null,
        blockNumber: row.block_number ?? null,
      });
    }
  });
  log(`  ${effects.size} printings covered from ${packsHit}/${packIds.length} packs`);
  return effects;
}

async function topUpEffects(missing, spineCards, effects) {
  log(`stage 3/5  per-card top-up for ${missing.length} printings...`);
  if (!missing.length) return;
  let filled = 0;
  await pooled(missing, 12, async (id) => {
    const packId = spineCards[id]?.pack_id;
    if (!packId) return;
    const row = await getJson(SOURCES.punkRecords.cardUrl(packId, id, LANG), {
      retries: 2, optional: true,
    });
    if (!row) return;
    effects.set(id, {
      effect: row.effect ?? null,
      trigger: row.trigger ?? null,
      blockNumber: row.block_number ?? null,
    });
    filled++;
  });
  log(`  ${filled} filled`);
}

async function fillBlocks(cards, spineCards, effects) {
  const bySet = new Map();
  for (const [id, card] of Object.entries(spineCards)) {
    const set = id.split('-')[0];
    if (!bySet.has(set)) bySet.set(set, []);
    bySet.get(set).push({ id, packId: card.pack_id });
  }

  const known = new Map();
  for (const [id, fx] of effects) {
    if (fx?.blockNumber === null || fx?.blockNumber === undefined) continue;
    const set = id.split('-')[0];
    if (!known.has(set)) known.set(set, new Set());
    known.get(set).add(fx.blockNumber);
  }

  const unknown = [...bySet.keys()].filter((set) => !known.has(set));
  log(`stage 3b/5  block numbers: ${known.size} sets known, ${unknown.length} to look up...`);

  const found = new Map();
  await pooled(unknown, 10, async (set) => {
    for (const candidate of bySet.get(set).slice(0, 3)) {
      const row = await getJson(
        SOURCES.punkRecords.cardUrl(candidate.packId, candidate.id, LANG),
        { retries: 2, optional: true }
      );
      if (row?.block_number !== null && row?.block_number !== undefined) {
        found.set(set, row.block_number);
        return;
      }
    }
  });

  for (const [set, block] of found) known.set(set, new Set([block]));

  const blockBySet = new Map(
    [...known.entries()].map(([set, blocks]) => [set, Math.min(...blocks)])
  );
  log(`  ${found.size} looked up, ${blockBySet.size}/${bySet.size} sets resolved`);
  return blockBySet;
}

const STANDARD_MIN_BLOCK = 2;
const ROTATION_NOTE = 'Block 1 rotated out of Standard on 1 April 2026';

async function loadBlockUpdates() {
  log('stage 3c/5  block-number updates...');
  try {
    const res = await fetch(RULES_SOURCES.bandai.blockUpdateUrl, {
      headers: { 'user-agent': 'poneglyph-ingest/1.0' },
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const ids = new Set(
      [...html.matchAll(/\b([A-Z]{2,3}\d{2}-\d{3})\b/g)].map((m) => m[1].toUpperCase())
    );
    if (ids.size === 0) throw new Error('no card numbers found — page layout changed?');
    log(`  ${ids.size} card numbers keep Standard legality across rotation`);
    return ids;
  } catch (err) {
    log(`  ! could not read the block-update list (${err.message}) — legality may be understated`);
    return new Set();
  }
}

async function loadMarket() {
  const empty = { prices: new Map(), setNames: new Map(), text: new Map() };
  if (!WITH_PRICES) return empty;
  log('stage 4/5  OPTCG API market data...');
  const ep = SOURCES.optcgApi.endpoints;
  const [sets, ...groups] = await Promise.all([
    getJson(ep.sets, { optional: true }),
    getJson(ep.setCards, { optional: true }),
    getJson(ep.starterCards, { optional: true }),
    getJson(ep.promoCards, { optional: true }),
  ]);

  const setNames = new Map();
  for (const s of sets ?? []) if (s?.set_id) setNames.set(s.set_id, s.set_name);

  const prices = new Map();
  const text = new Map();
  let rows = 0;
  for (const group of groups) {
    for (const row of group ?? []) {
      rows++;
      const imageId = row.card_image_id || row.card_set_id;
      if (!imageId) continue;
      const market = price(row.market_price);
      const low = price(row.inventory_price);
      if (market !== null || low !== null) {
        prices.set(imageId, {
          market, low,
          scraped: row.date_scraped ?? null,
          mirror: row.card_image ?? null,
        });
      }
      const t = (row.card_text ?? '').trim();
      if (t && !text.has(baseId(imageId))) text.set(baseId(imageId), t);
    }
  }
  log(`  ${rows} rows -> ${prices.size} priced printings, ${setNames.size} set names`);
  return { prices, setNames, text };
}

function merge({ packs, cards }, effects, market, blockBySet, blockUpdates) {
  log('stage 5/5  merging...');

  const idsByPack = new Map();
  for (const [printingId, c] of Object.entries(cards)) {
    if (!idsByPack.has(c.pack_id)) idsByPack.set(c.pack_id, []);
    idsByPack.get(c.pack_id).push(printingId);
  }

  const packById = new Map();
  for (const [id, pack] of Object.entries(packs)) {
    packById.set(id, normalisePack({ ...pack, id }, idsByPack.get(id) ?? []));
  }

  const grouped = new Map();
  for (const [printingId, c] of Object.entries(cards)) {
    const key = baseId(printingId);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ printingId, ...c });
  }

  const out = [];
  for (const [id, printings] of grouped) {
    printings.sort((a, b) =>
      a.printingId === id ? -1 : b.printingId === id ? 1 : a.printingId.localeCompare(b.printingId)
    );
    const head = printings[0];
    const fx = effects.get(id) ?? effects.get(head.printingId) ?? {};
    const effect = decode(fx.effect ?? market.text.get(id) ?? null);
    const trigger = decode(fx.trigger ?? null);
    const name = decode(head.name);
    const types = (head.types ?? []).map(decode);
    const pack = packById.get(head.pack_id);

    const printed = printings.map((p, position) => {
      const price = market.prices.get(p.printingId) ?? null;
      const rarity = rarityName(p.rarity);
      return {
        id: p.printingId,
        version: position + 1,
        label: versionLabel(p.printingId, position),
        variant: variantLabel(p.printingId),
        rarity,
        rarityCode: RARITY_CODES[rarity] ?? String(p.rarity ?? ''),
        image: p.img_url ?? null,
        imageMirror: price?.mirror ?? SOURCES.optcgApi.imageUrl(p.printingId),
        setId: p.pack_id,
        price: price ? { market: price.market, low: price.low, updated: price.scraped } : null,
      };
    });

    const markets = printed.map((p) => p.price?.market).filter((n) => typeof n === 'number');
    const rarity = rarityName(head.rarity);
    const isLeader = head.category === 'Leader';

    const block = fx.blockNumber ?? blockBySet?.get(id.split('-')[0]) ?? null;
    const blockLegal = block !== null && block >= STANDARD_MIN_BLOCK;
    const keptByUpdate = blockUpdates?.has(id) ?? false;
    const standardLegal = blockLegal || keptByUpdate;
    const formats = standardLegal ? ['Standard', 'Extra'] : ['Extra'];

    out.push({
      id,
      slug: id.toLowerCase(),
      name,
      category: head.category ?? 'Unknown',
      colors: head.colors ?? [],
      colorIdentity: (head.colors ?? []).join('/') || 'Colorless',
      cost: isLeader ? null : head.cost ?? null,
      life: isLeader ? head.cost ?? null : null,
      power: head.power ?? null,
      counter: head.counter ?? null,
      attributes: head.attributes ?? [],
      types,
      keywords: (head.keywords?.length ? head.keywords : keywordsFromEffect(effect)) ?? [],
      effect,
      trigger,
      blockNumber: block,
      rarity,
      rarityCode: RARITY_CODES[rarity] ?? String(head.rarity ?? ''),
      formats,
      standardLegal,
      legalBy: keptByUpdate && !blockLegal ? 'block-update' : blockLegal ? 'block' : null,
      setId: head.pack_id,
      setCode: pack?.code ?? '',
      setName: decode(market.setNames.get(pack?.code ?? '') ?? pack?.name ?? ''),
      setGroup: pack?.group ?? 'Other',
      printings: printed,
      printingCount: printed.length,
      image: printed[0]?.image ?? null,
      priceLow: markets.length ? Math.min(...markets) : null,
      priceHigh: markets.length ? Math.max(...markets) : null,
      search: [id, name, effect ?? '', types.join(' '), pack?.code ?? '', pack?.name ?? '']
        .join(' ')
        .toLowerCase(),
    });
  }

  out.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));

  const setsUsed = new Map();
  for (const card of out) {
    const pack = packById.get(card.setId);
    if (!pack) continue;
    if (!setsUsed.has(pack.id)) {
      setsUsed.set(pack.id, {
        ...pack,
        name: decode(market.setNames.get(pack.code) ?? pack.name),
        cardCount: 0,
        printingCount: 0,
      });
    }
    const s = setsUsed.get(pack.id);
    s.cardCount++;
    s.printingCount += card.printingCount;
  }
  const sets = [...setsUsed.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return { cards: out, sets };
}

function buildFilters(cards, sets) {
  const tally = (pickValue) => {
    const m = new Map();
    for (const c of cards) {
      for (const v of [pickValue(c)].flat()) {
        if (v === null || v === undefined || v === '') continue;
        m.set(v, (m.get(v) ?? 0) + 1);
      }
    }
    return [...m.entries()].map(([value, count]) => ({ value, count }));
  };
  const byCount = (a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value));
  const byValue = (a, b) => String(a.value).localeCompare(String(b.value), 'en', { numeric: true });
  const COLOR_ORDER = ['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'];
  const byColor = (a, b) => COLOR_ORDER.indexOf(a.value) - COLOR_ORDER.indexOf(b.value);

  return {
    colors: tally((c) => c.colors).sort(byColor),
    categories: tally((c) => c.category).sort(byCount),
    rarities: tally((c) => c.rarity).sort(byCount),
    attributes: tally((c) => c.attributes).sort(byCount),
    costs: tally((c) => c.cost).sort(byValue),
    lives: tally((c) => c.life).sort(byValue),
    powers: tally((c) => c.power).sort(byValue),
    counters: tally((c) => c.counter).sort(byValue),
    keywords: tally((c) => c.keywords).sort(byCount),
    types: tally((c) => c.types).sort(byCount),
    setGroups: tally((c) => c.setGroup).sort(byCount),
    formats: tally((c) => c.formats).sort(byCount),
    blocks: tally((c) => c.blockNumber).sort(byValue),
    sets: sets.map((s) => ({ value: s.code, count: s.cardCount, id: s.id, name: s.name, group: s.group })),
  };
}

async function check() {
  const upstream = await getJson(SOURCES.punkRecords.manifestUrl(LANG), { optional: true });
  if (!upstream?.generated_at) {
    log('check: upstream manifest unavailable — rebuilding to be safe');
    process.exit(0);
  }
  const remote = new Date(upstream.generated_at * 1000).toISOString();

  let local = null;
  try {
    local = JSON.parse(await readFile(path.join(OUT_DIR, 'meta.json'), 'utf8')).upstreamBuiltAt;
  } catch {
    log('check: no local archive yet — rebuilding');
    process.exit(0);
  }

  if (local !== remote) {
    log(`check: upstream moved ${local ?? 'never'} -> ${remote} — rebuilding`);
    process.exit(0);
  }
  log(`check: archive is current (upstream built ${remote})`);
  process.exit(3);
}

async function main() {
  if (has('check')) return check();

  const started = Date.now();
  const spine = await loadSpine();

  const packIds = [...new Set(Object.values(spine.cards).map((c) => c.pack_id))].filter(Boolean);
  const effects = await loadBulkEffects(packIds);

  const missing = Object.keys(spine.cards).filter((id) => {
    const fx = effects.get(id) ?? effects.get(baseId(id));
    return !fx || fx.effect === undefined || fx.effect === null;
  });
  await topUpEffects(missing, spine.cards, effects);

  const blockBySet = await fillBlocks(null, spine.cards, effects);
  const blockUpdates = await loadBlockUpdates();
  const market = await loadMarket();
  const { cards, sets } = merge(spine, effects, market, blockBySet, blockUpdates);

  if (cards.length < MIN_EXPECTED_CARDS) {
    throw new Error(`only ${cards.length} cards merged — refusing to overwrite`);
  }

  const filters = buildFilters(cards, sets);
  const withEffect = cards.filter((c) => c.effect).length;
  const withPrice = cards.filter((c) => c.priceLow !== null).length;

  const meta = {
    site: 'Poneglyph',
    language: LANG,
    generatedAt: new Date().toISOString(),
    upstreamBuiltAt: spine.manifest?.generated_at
      ? new Date(spine.manifest.generated_at * 1000).toISOString()
      : null,
    counts: {
      cards: cards.length,
      printings: cards.reduce((n, c) => n + c.printingCount, 0),
      sets: sets.length,
      withEffect,
      withPrice,
      traits: filters.types.length,
      keywords: filters.keywords.length,
    },
    coverage: {
      effect: +((withEffect / cards.length) * 100).toFixed(1),
      price: +((withPrice / cards.length) * 100).toFixed(1),
      block: +((cards.filter((c) => c.blockNumber !== null).length / cards.length) * 100).toFixed(1),
    },
    formats: {
      standardMinBlock: STANDARD_MIN_BLOCK,
      note: ROTATION_NOTE,
      keptByBlockUpdate: cards.filter((c) => c.legalBy === 'block-update').length,
      standardLegal: cards.filter((c) => c.standardLegal).length,
      extraOnly: cards.filter((c) => !c.standardLegal).length,
    },
    sources: [
      { ...pick(SOURCES.punkRecords, 'id', 'label', 'home'), role: 'primary' },
      { ...pick(SOURCES.vegapullRecords, 'id', 'label', 'home'), role: 'rules text' },
      { ...pick(SOURCES.optcgApi, 'id', 'label', 'home'), role: 'prices & set names' },
    ],
    durationMs: Date.now() - started,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await Promise.all([
    writeFile(path.join(OUT_DIR, 'cards.json'), JSON.stringify(cards)),
    writeFile(path.join(OUT_DIR, 'sets.json'), JSON.stringify(sets, null, 2)),
    writeFile(path.join(OUT_DIR, 'filters.json'), JSON.stringify(filters, null, 2)),
    writeFile(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2)),
  ]);
  await writeSlimIndex(cards);
  await recordPrices(cards);

  log('done in', ((Date.now() - started) / 1000).toFixed(1) + 's');
  console.table(meta.counts);
  log(`rules text on ${meta.coverage.effect}% of cards, prices on ${meta.coverage.price}%`);
}

async function writeSlimIndex(cards) {
  const dir = path.resolve('public', 'data');
  await mkdir(dir, { recursive: true });
  const slim = cards.map((c) => ({
    i: c.id,
    n: c.name,
    c: c.colors,
    y: c.category,
    o: c.cost,
    l: c.life,
    p: c.power,
    u: c.counter,
    a: c.attributes,
    t: c.types,
    k: c.keywords,
    r: c.rarity,
    s: c.setCode,
    g: c.setGroup,
    m: c.image,
    v: c.printingCount,
    $: c.priceLow,
    q: c.search,
    f: c.standardLegal ? 1 : 0,
    b: c.blockNumber,
  }));
  const file = path.join(dir, 'cards-index.json');
  await writeFile(file, JSON.stringify(slim));
  const kb = (Buffer.byteLength(JSON.stringify(slim)) / 1024).toFixed(0);
  log(`browser index -> public/data/cards-index.json (${kb} KB)`);
}

async function recordPrices(cards) {
  const file = path.join(OUT_DIR, 'price-history.json');
  const today = new Date().toISOString().slice(0, 10);

  const held = await readFile(file, 'utf8')
    .then(JSON.parse)
    .catch(() => ({ days: [], prices: {} }));

  const { days, prices, moved } = appendPrices(held, cards, today);

  const payload = { generatedAt: new Date().toISOString(), days, prices };
  await writeFile(file, JSON.stringify(payload));
  const kb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(0);
  log(
    `price history -> ${days.length} day(s), ${moved} price(s) moved today, ` +
      `${Object.keys(prices).length} cards, ${kb} KB`
  );
}

main().catch((err) => {
  console.error('[ingest] FAILED —', err.message);
  console.error('[ingest] existing data files were left untouched');
  process.exit(1);
});
