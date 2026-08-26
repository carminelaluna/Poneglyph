#!/usr/bin/env node
/**
 * Poneglyph — official events.
 *
 *   node scripts/ingest-events.mjs
 *
 * Reads Bandai's own event pages: Regionals, Finals, Treasure Cups, Extra Grand
 * Battles and the rest, each with a date, a venue and a registration link.
 *
 * **These pages were written off twice as client-rendered.** They are not. The
 * events are in the served HTML — a good way down it, past sixty lines of
 * navigation, which is exactly far enough for a first look to miss them.
 *
 * The index at /events/ is followed rather than a list of pages being hardcoded.
 * Bandai adds a page per season and per series and the URLs change, so following
 * the index is what makes a new series appear here on its own.
 *
 * Writes data/events-official.json and public/data/events-official.json.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { RULES_SOURCES } from './sources.mjs';

const DATA = path.resolve('data');
const PUBLIC = path.resolve('public', 'data');
const INDEX = RULES_SOURCES.bandai.eventsUrl;

/** Their server, their bandwidth — one request at a time, with a pause. */
const DELAY_MS = 700;

/** Below this the page has changed shape and the result is not worth keeping. */
const MIN_EVENTS = 10;

const log = (...m) => console.log('[events]', ...m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * Zero-width and non-breaking characters, which their editor leaves in the text —
 * one date ends "2026" followed by U+200B. Invisible in a diff and in an editor,
 * and enough to make a date parse fail or a name compare unequal. Written as escapes
 * for the same reason `npm run check` exists.
 */
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
      /* Identify the project rather than pretending to be a browser. */
      'user-agent': 'Poneglyph/1.0 (unofficial ONE PIECE CARD GAME archive)',
      accept: 'text/html',
    },
  });
  if (!res.ok) throw new Error(`${url} — HTTP ${res.status}`);
  return res.text();
}

/**
 * What kind of event a page holds.
 *
 * Matched on the slug, because the titles carry a season and a month that would
 * make every season its own category. Order matters: `extra-grand-battle` has to be
 * tested before `extra-battle`, and `regional-season2-side` is a side event rather
 * than a Regional.
 */
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

/**
 * Which part of the world a venue is in.
 *
 * Matched against the whole address rather than its last segment: some venues end in
 * a hall name ("ExCel London Hall 1-11") or a US zip, and the country sits earlier.
 * Anything not recognised stays null — a wrong region is worse than no region, since
 * the whole point is filtering by it.
 *
 * The Finals pages state their regions outright, and those win over this.
 */
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
  /* Last: "USA" is a substring of nothing else here, but state codes are short. */
  ['North America', ['usa', 'united states', 'canada', ', ab', ', bc', ', on', ', qc',
    'convention center', 'convention centre']],
];

/**
 * The regions Bandai itself uses, as headings above groups of events.
 *
 * A heading that names one of these is context, not an event — and it is better
 * evidence than an address, because it is what they filed the event under.
 */
const KNOWN_REGIONS = ['North America', 'Europe', 'Oceania', 'Latin America', 'Asia'];

const canonicalRegion = (text) =>
  KNOWN_REGIONS.find((r) => r.toLowerCase() === String(text ?? '').trim().toLowerCase()) ?? null;

function regionOf(venue) {
  if (!venue) return null;
  const text = ` ${venue.toLowerCase()} `;
  for (const [region, needles] of REGIONS) {
    if (needles.some((n) => text.includes(n))) return region;
  }
  /* A bare US state code and zip — "Dallas, TX 75202" — with no country named. */
  if (/,\s*[a-z]{2}\s+\d{5}/i.test(venue)) return 'North America';
  return null;
}

/**
 * When registration opens, from the "Application Period" table.
 *
 * Bandai publishes one opening date per event month — "For August Events: May 24,
 * 2026" — and a time per region. Every one of those dates is a Sunday.
 *
 * They also say, in the same block, that it is **a guideline** and that the real
 * date can vary by organiser. That caveat travels with the data and is printed on
 * the page; a date that looks exact and is not would be worse than none.
 */
function parseApplicationPeriod(html) {
  /*
   * Read from the flattened lines, not the markup. The dates sit as bare text split
   * by <br> on one page and the region times are <h5> headings with the time in a
   * later element on another — the same field in two shapes, which is the pattern
   * across this whole site. Flattened, both read as:
   *
   *   For August Events: May 24, 2026
   *   North America:
   *   9:00am PDT / 12:00pm EDT
   */
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

    /*
     * The colon is what separates the times table from the region headings that
     * group the events themselves — "North America:" here, bare "North America"
     * there. Without it every region heading would swallow the event beneath it.
     */
    const forRegion = /^(North America|Europe|Oceania|Latin America|Asia)\s*:$/i.exec(rows[i]);
    if (forRegion) {
      const next = rows[i + 1] ?? '';
      if (/\d/.test(next) && next.length <= 48) times[canonicalRegion(forRegion[1])] = next;
    }
  }

  return { opens, times };
}

/**
 * The first day a date line refers to, as YYYY-MM-DD, for sorting.
 *
 * Their dates come in at least six shapes — "August 1, 2026", "August 15-16 2026"
 * with no comma, "August 14 - 16, 2026", "July 30 - August 2, 2026" spanning two
 * months. Rather than enumerate them, this takes the first month name, the first
 * number after it and the first four-digit year, which is the start date in all of
 * them. The original text is kept for display; this is only ever used to sort.
 */
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

/**
 * An event block as lines of plain text.
 *
 * Reading fields straight out of the markup does not survive their layouts. The
 * value sits bare after `Date:` on one page, inside `<div>` on another, and on a
 * third the label is wrapped — `<strong>Date: </strong>January 7-10, 2027` — so
 * "everything up to the next tag" is the empty string. Flattening first and then
 * reading by label works the same way in all of them.
 *
 * Only the tags that end a line become newlines; the rest just go.
 */
function lines(html) {
  /*
   * A word, not a control character. decode() collapses runs of whitespace, so a
   * newline inserted here would be gone before the split — and a control character
   * is the one thing this repository has been bitten by three times.
   */
  const BREAK = ' __PONEGLYPH_BREAK__ ';
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, BREAK)
    /* Opening tags too: `<strong>PlayLATAM</strong><dl><dd>Date: …` has the
       organiser and the date running together unless <dd> starts a new line. */
    .replace(/<\/?(p|dd|dt|dl|div|li|h[1-6]|tr|strong)[^>]*>/gi, BREAK)
    .replace(/<[^>]*>/g, ' ')
    .split('__PONEGLYPH_BREAK__')
    .map((line) => decode(line))
    .filter(Boolean);
}

/**
 * One labelled field out of those lines.
 *
 * The lines are joined with a pipe, so the value stops at the next one — `(.*)`
 * would swallow the venue into the date and every field after it.
 */
function field(text, label) {
  const found = new RegExp(`${label}\\s*:\\s*([^|]*)`, 'i').exec(text);
  const value = found ? decode(found[1]).replace(/^[-–—:\s]+/, '').trim() : '';
  return value || null;
}

/**
 * The events on one page.
 *
 * Anchored on <h4> and <h5>, which is where the event name sits — <h5> on the
 * Regionals and Treasure Cup pages, <h4> on the Mall Tour and BCG Fest ones.
 * Headings that are not events (a giveaway, a section title) carry no `Date:` and
 * fall out on their own, so the anchor does not have to be precise.
 */
function parsePage(html, url) {
  const title = strip(/<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '')
    .replace(/\s*\|.*$/, '')
    .trim();

  const events = [];

  /*
   * Split keeping the heading level, because the two mean different things. The
   * Finals pages read:
   *
   *   <h4>Latin America</h4>  <h5>[Season 1]</h5>  <strong>PlayLATAM</strong>
   *   Date: …  Venue: …
   *
   * Taking the heading as the name gives three events all called "[Season 1]". The
   * name is in the <strong>, the season is the <h5>, and the region is an <h4> that
   * carries no event of its own — so an <h4> with no date is remembered as context
   * for the ones that follow rather than discarded.
   */
  const parts = html.split(/<(h[45])[^>]*>/i);
  let region = null;

  for (let i = 1; i < parts.length; i += 2) {
    const level = parts[i].toLowerCase();
    const chunk = parts[i + 1] ?? '';
    const heading = strip(chunk.split(/<\/h[45]>/i)[0]);
    const body = chunk.slice(chunk.search(/<\/h[45]>/i));
    if (!heading) continue;

    /*
     * A heading that names a region groups what follows; it is never an event.
     * Checked at both levels — the Finals pages put them in <h4>, the Regionals page
     * in <h5> — and by name rather than by level, which is why "Event Schedule and
     * Tournament Organizer" no longer gets mistaken for a place.
     */
    const named_region = canonicalRegion(heading);
    if (named_region) {
      region = named_region;
      continue;
    }

    const rows = lines(body);
    const text = rows.join(' | ');
    const date = field(text, 'Date');

    if (!date) continue;

    /* The first line that is not a labelled field — the organiser, when they name one. */
    const named = rows.find((line) => !/^(date|venue|link)\s*:/i.test(line) && line.length > 1);

    const venue = field(text, 'Venue');
    /* The registration link, when there is one — some events list a date only. */
    const link = /<a[^>]+href="([^"]+)"[^>]*>[^<]*registration/i.exec(body)?.[1] ?? null;

    const cleanVenue = venue && !/^tba$|^tbd$/i.test(venue) ? venue : null;

    /*
     * A note this specific event carries — "*Registration begins 2nd August
     * 9AM(CEST)". Rarer than the table but exact, so it wins over the guideline.
     */
    const note = rows.find((line) => /registration\s+(begins|opens)/i.test(line));

    events.push({
      name: named ?? heading,
      /* Kept apart so the page can show them as context rather than as the name. */
      label: named ? heading : null,
      /* The page's own heading first; the address only when it did not say. */
      region: region ?? regionOf(cleanVenue),
      date,
      start: startDate(date),
      /* Named, not blank: a missing venue is "not announced", not an empty cell. */
      venue: cleanVenue,
      link: link ? decode(link) : null,
      registrationNote: note ? decode(note).replace(/^\*+\s*/, '') : null,
    });
  }

  /*
   * A region that is the same on every event is not a region.
   *
   * The Finals pages head their sections "Latin America", "Europe", "Oceania" — real
   * groupings. The Regionals page heads its one section "Event Schedule and
   * Tournament Organizer", which is a page title, and it landed on all 28 rows.
   * Rather than guess which headings are place names, drop any that varies with
   * nothing.
   */
  /*
   * When registration opens, from the table at the foot of the page, matched to each
   * event by the month it runs in. A per-event note wins over it — see the event
   * loop — and both are labelled as Bandai's guideline on the page.
   */
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
      /* One page failing is not a reason to lose the rest. */
      console.error(`[events] ! ${slug}: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  const total = groups.reduce((n, g) => n + g.events.length, 0);

  /*
   * Refuse to write nonsense. If their markup changes, this finds nothing and the
   * page would silently empty out — worse than keeping yesterday's list.
   */
  if (total < MIN_EVENTS) {
    console.error(
      `[events] FAILED — only ${total} events parsed, expected at least ${MIN_EVENTS}.\n` +
        '         The page markup has probably changed. Keeping the previous file.'
    );
    process.exit(1);
  }

  /* Soonest first, and events with no parseable date last rather than first. */
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
