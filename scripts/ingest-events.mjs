#!/usr/bin/env node
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { RULES_SOURCES } from './sources.mjs';

const DATA = path.resolve('data');
const PUBLIC = path.resolve('public', 'data');
const INDEX = RULES_SOURCES.bandai.eventsUrl;

const DELAY_MS = 700;

const MIN_EVENTS = 10;

const log = (...m) => console.log('[events]', ...m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INVISIBLE = /[\u200b\u200c\u200d\ufeff\u00a0]/g;

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'",
  '&apos;': "'", '&nbsp;': ' ', '&#8203;': '', '&rsquo;': '’', '&ndash;': '–',
};

const decode = (text) =>
  String(text ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => ENTITIES[m] ?? m)
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim();

const strip = (html) => decode(String(html ?? '').replace(/<[^>]*>/g, ' '));

async function getText(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Poneglyph/1.0 (unofficial ONE PIECE CARD GAME archive)',
      accept: 'text/html',
    },
  });
  if (!res.ok) throw new Error(`${url} — HTTP ${res.status}`);
  return res.text();
}

const TYPES = [
  [/finals/i, 'Finals'],
  [/regional-.*-side|side/i, 'Side event'],
  [/regional/i, 'Regional'],
  [/treasure-cup/i, 'Treasure Cup'],
  [/extra-grand-battle/i, 'Extra Grand Battle'],
  [/extra-battle/i, 'Extra Battle'],
  [/coliseum/i, 'Coliseum'],
  [/bcgfest/i, 'BCG Fest'],
  [/malltour/i, 'Mall Tour'],
  [/pirates-party/i, 'Pirates Party'],
  [/beginners/i, 'Beginners event'],
  [/store/i, 'Store event'],
];

const typeOf = (slug) => TYPES.find(([re]) => re.test(slug))?.[1] ?? 'Other event';

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const REGIONS = [
  ['Europe', ['netherlands', 'united kingdom', ' uk', 'france', 'spain', 'croatia', 'sweden',
    'greece', 'czechia', 'czech republic', 'portugal', 'germany', 'italy', 'belgium', 'poland',
    'austria', 'switzerland', 'denmark', 'norway', 'finland', 'ireland', 'hungary', 'romania',
    'slovakia', 'slovenia', 'serbia', 'bulgaria', 'lithuania', 'latvia', 'estonia', 'luxembourg',
    'malta', 'cyprus', 'iceland', 'london', 'utrecht', 'paris', 'madrid', 'lisbon']],
  ['Latin America', ['mexico', 'chile', 'brazil', 'brasil', 'argentina', 'peru', 'colombia',
    'ecuador', 'uruguay', 'paraguay', 'bolivia', 'venezuela', 'costa rica', 'panama',
    'guatemala', 'dominican', 'santiago', 'puebla']],
  ['Oceania', ['australia', 'new zealand', 'melbourne', 'sydney', 'brisbane', 'auckland']],
  ['Asia', ['japan', 'korea', 'singapore', 'taiwan', 'thailand', 'philippines', 'indonesia',
    'malaysia', 'hong kong', 'vietnam', 'india']],
  ['North America', ['usa', 'united states', 'canada', ', ab', ', bc', ', on', ', qc',
    'convention center', 'convention centre']],
];

const KNOWN_REGIONS = ['North America', 'Europe', 'Oceania', 'Latin America', 'Asia'];

const canonicalRegion = (text) =>
  KNOWN_REGIONS.find((r) => r.toLowerCase() === String(text ?? '').trim().toLowerCase()) ?? null;

function regionOf(venue) {
  if (!venue) return null;
  const text = ` ${venue.toLowerCase()} `;
  for (const [region, needles] of REGIONS) {
    if (needles.some((n) => text.includes(n))) return region;
  }
  if (/,\s*[a-z]{2}\s+\d{5}/i.test(venue)) return 'North America';
  return null;
}

function parseApplicationPeriod(html) {
  const rows = lines(html);
  const opens = {};
  const times = {};

  for (let i = 0; i < rows.length; i++) {
    const forMonth =
      /^For\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+Events\s*:\s*(.+)$/i.exec(
        rows[i]
      );
    if (forMonth) {
      const date = startDate(forMonth[2]);
      if (date) opens[forMonth[1].toLowerCase()] = date;
      continue;
    }

    const forRegion = /^(North America|Europe|Oceania|Latin America|Asia)\s*:$/i.exec(rows[i]);
    if (forRegion) {
      const next = rows[i + 1] ?? '';
      if (/\d/.test(next) && next.length <= 48) times[canonicalRegion(forRegion[1])] = next;
    }
  }

  return { opens, times };
}

function startDate(text) {
  const clean = decode(text).toLowerCase();
  const month = /(january|february|march|april|may|june|july|august|september|october|november|december)/.exec(clean);
  if (!month) return null;
  const after = clean.slice(month.index + month[1].length);
  const day = /\d{1,2}/.exec(after);
  const year = /\b(20\d{2})\b/.exec(clean);
  if (!day || !year) return null;
  return `${year[1]}-${String(MONTHS[month[1]]).padStart(2, '0')}-${day[0].padStart(2, '0')}`;
}

function lines(html) {
  const BREAK = ' __PONEGLYPH_BREAK__ ';
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, BREAK)
    .replace(/<\/?(p|dd|dt|dl|div|li|h[1-6]|tr|strong)[^>]*>/gi, BREAK)
    .replace(/<[^>]*>/g, ' ')
    .split('__PONEGLYPH_BREAK__')
    .map((line) => decode(line))
    .filter(Boolean);
}

function field(text, label) {
  const found = new RegExp(`${label}\\s*:\\s*([^|]*)`, 'i').exec(text);
  const value = found ? decode(found[1]).replace(/^[-–—:\s]+/, '').trim() : '';
  return value || null;
}

function parsePage(html, url) {
  const title = strip(/<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '')
    .replace(/\s*\|.*$/, '')
    .trim();

  const events = [];

  const parts = html.split(/<(h[45])[^>]*>/i);
  let region = null;

  for (let i = 1; i < parts.length; i += 2) {
    const level = parts[i].toLowerCase();
    const chunk = parts[i + 1] ?? '';
    const heading = strip(chunk.split(/<\/h[45]>/i)[0]);
    const body = chunk.slice(chunk.search(/<\/h[45]>/i));
    if (!heading) continue;

    const named_region = canonicalRegion(heading);
    if (named_region) {
      region = named_region;
      continue;
    }

    const rows = lines(body);
    const text = rows.join(' | ');
    const date = field(text, 'Date');

    if (!date) continue;

    const named = rows.find((line) => !/^(date|venue|link)\s*:/i.test(line) && line.length > 1);

    const venue = field(text, 'Venue');
    const link = /<a[^>]+href="([^"]+)"[^>]*>[^<]*registration/i.exec(body)?.[1] ?? null;

    const cleanVenue = venue && !/^tba$|^tbd$/i.test(venue) ? venue : null;

    const note = rows.find((line) => /registration\s+(begins|opens)/i.test(line));

    events.push({
      name: named ?? heading,
      label: named ? heading : null,
      region: region ?? regionOf(cleanVenue),
      date,
      start: startDate(date),
      venue: cleanVenue,
      link: link ? decode(link) : null,
      registrationNote: note ? decode(note).replace(/^\*+\s*/, '') : null,
    });
  }

  const period = parseApplicationPeriod(html);
  for (const event of events) {
    if (!event.start) continue;
    const month = Object.keys(MONTHS)[Number(event.start.slice(5, 7)) - 1];
    event.opens = period.opens[month] ?? null;
  }

  return { title, url, events, registrationTimes: period.times };
}

async function main() {
  const started = Date.now();

  log(`reading ${INDEX}`);
  const index = await getText(INDEX);

  const urls = [
    ...new Set(
      [...index.matchAll(/href="([^"]*\/events\/[^"]+\.html)"/g)]
        .map((m) => new URL(m[1], INDEX).href)
        .filter((u) => u.includes('/events/'))
    ),
  ].sort();

  log(`${urls.length} event pages linked`);

  const groups = [];
  for (const url of urls) {
    const slug = path.basename(new URL(url).pathname, '.html');
    try {
      const page = parsePage(await getText(url), url);
      if (page.events.length > 0) {
        groups.push({ slug, type: typeOf(slug), ...page });
        log(`  ${slug.padEnd(30)} ${String(page.events.length).padStart(3)} events`);
      }
    } catch (err) {
      console.error(`[events] ! ${slug}: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  const total = groups.reduce((n, g) => n + g.events.length, 0);

  if (total < MIN_EVENTS) {
    console.error(
      `[events] FAILED — only ${total} events parsed, expected at least ${MIN_EVENTS}.\n` +
        '         The page markup has probably changed. Keeping the previous file.'
    );
    process.exit(1);
  }

  for (const group of groups) {
    group.events.sort((a, b) => (a.start ?? '9999').localeCompare(b.start ?? '9999'));
  }

  const byType = {};
  for (const group of groups) byType[group.type] = (byType[group.type] ?? 0) + group.events.length;

  const payload = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    source: {
      id: RULES_SOURCES.bandai.id,
      label: RULES_SOURCES.bandai.label,
      home: RULES_SOURCES.bandai.home,
      index: INDEX,
    },
    counts: { groups: groups.length, events: total, types: Object.keys(byType).length },
    groups,
  };

  await mkdir(PUBLIC, { recursive: true });
  const json = JSON.stringify(payload);
  await writeFile(path.join(DATA, 'events-official.json'), json);
  await writeFile(path.join(PUBLIC, 'events-official.json'), json);

  log(`${total} events across ${groups.length} pages, ${Object.keys(byType).length} types`);
  console.table(byType);
}

main().catch((err) => {
  console.error('[events] FAILED —', err.message);
  process.exit(1);
});
