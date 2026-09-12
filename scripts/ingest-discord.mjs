#!/usr/bin/env node
import { writeFile, readFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { filesOf, newestId, revealsFromMessages, textOf } from './discord.mjs';
import { BACKOFF, exitOnFailure, finalError, refusal, TURNED_AWAY, writtenAt } from './refusal.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const DATA = path.resolve('data');

const THUMBS = path.resolve(flag('thumbs', path.join('public', 'spoilers')));
const THUMB_WIDTH = 320;
const MAX_DOWNLOAD = 25 * 1024 * 1024;
const OUT = path.resolve(flag('out', path.join(DATA, 'spoilers-discord.json')));
const log = (...m) => console.log('[discord]', ...m);

const TOKEN = process.env.DISCORD_BOT_TOKEN ?? '';
const CHANNEL = process.env.DISCORD_SPOILER_CHANNEL ?? '';
const API = 'https://discord.com/api/v10';

const PAGE = 100;

const MESSAGE_CONTENT_FLAGS = { approved: 1 << 18, limited: 1 << 19 };

const WRITTEN_BY_A_PERSON = new Set([0, 19, 20, 23]);

const FIRST_RUN_PAGES = 5;

async function get(url, { retries = 4 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          authorization: `Bot ${TOKEN}`,
          'user-agent': 'poneglyph-spoilers/1.0 (+https://github.com/carminelaluna/Poneglyph)',
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(30_000),
      });

      if (res.status === 401) throw new Error('401 — DISCORD_BOT_TOKEN is missing or wrong');
      if (res.status === 403) {
        throw new Error(
          '403 — the bot is authenticated but cannot read this channel. It needs ' +
            'View Channel and Read Message History *on this channel*: a category or ' +
            'channel-level override will deny them even when the role has them ' +
            'server-wide. Check the bot is in the right server, then Edit Channel ' +
            '-> Permissions and add it explicitly.'
        );
      }
      if (res.status === 404) {
        throw new Error(`404 — no such channel: ${CHANNEL}. Check DISCORD_SPOILER_CHANNEL.`);
      }
      if (TURNED_AWAY.includes(res.status)) {
        throw refusal(`HTTP ${res.status} — Discord turned us away`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      return await res.json();
    } catch (err) {
      if (attempt === retries) throw finalError(url, err);
      const wait = BACKOFF[attempt - 1] ?? 30;
      log(`  ${err.message} — retrying in ${wait}s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
  return null;
}

async function thumbnail(id, url, sharp) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;

    const length = Number(res.headers.get('content-length') ?? 0);
    if (length > MAX_DOWNLOAD) return null;

    const body = Buffer.from(await res.arrayBuffer());
    if (body.byteLength > MAX_DOWNLOAD) return null;

    const out = await sharp(body)
      .rotate()
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();

    await mkdir(THUMBS, { recursive: true });
    await writeFile(path.join(THUMBS, `${id}.webp`), out);
    return { file: `${id}.webp`, bytes: out.byteLength };
  } catch {
    return null;
  }
}

async function lastSeen() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8')).lastMessageId ?? null;
  } catch {
    return null;
  }
}

async function readChannel() {
  const after = has('all') ? null : await lastSeen();
  const pages = after ? Infinity : Number(flag('limit', 0)) || FIRST_RUN_PAGES;

  const messages = [];
  let cursor = after;
  let page = 0;

  while (page < pages) {
    const query = cursor
      ? after
        ? `after=${cursor}`
        : `before=${cursor}`
      : '';
    const batch = await get(`${API}/channels/${CHANNEL}/messages?limit=${PAGE}${query ? `&${query}` : ''}`);
    if (!Array.isArray(batch)) throw new Error('unexpected response from the messages API');

    page++;
    messages.push(...batch);
    log(`  page ${page}: ${batch.length} messages`);
    if (batch.length < PAGE) break;

    cursor = after ? newestId(batch) : batch[batch.length - 1]?.id;
    if (!cursor) break;
  }

  return messages;
}

async function main() {
  const started = Date.now();

  const cards = JSON.parse(await readFile(path.join(DATA, 'cards.json'), 'utf8'));
  const released = new Set(cards.map((c) => c.id.split('-')[0].toUpperCase()));
  log(`${released.size} set prefixes already in the card archive`);

  const fixture = flag('fixture');
  let messages;

  if (fixture) {
    log(`reading ${fixture}`);
    messages = JSON.parse(await readFile(path.resolve(fixture), 'utf8'));
  } else {
    if (!TOKEN || !CHANNEL) {
      throw new Error(
        'DISCORD_BOT_TOKEN and DISCORD_SPOILER_CHANNEL must both be set — see the header of this file'
      );
    }
    log(`reading channel ${CHANNEL}`);
    messages = await readChannel();
  }

  log(`${messages.length} messages`);

  if (has('inspect')) {
    if (!fixture) {
      const app = await get(`${API}/applications/@me`).catch(() => null);
      if (app) {
        const flags = Number(app.flags ?? 0);
        const on = Object.entries(MESSAGE_CONTENT_FLAGS).filter(([, bit]) => flags & bit);
        log('');
        log(`this token belongs to: ${app.name} (${app.id})`);
        log(
          on.length
            ? `  Message Content intent: ON (${on.map(([k]) => k).join(', ')})`
            : '  Message Content intent: OFF — content and attachments will be blank'
        );
      }
    }

    const kinds = new Map();
    let withText = 0;
    let withFiles = 0;
    let withEmbeds = 0;
    let webhooks = 0;
    let forwards = 0;
    const files = [];

    for (const m of messages) {
      kinds.set(m?.type ?? '?', (kinds.get(m?.type ?? '?') ?? 0) + 1);
      if (textOf(m)) withText++;
      if (filesOf(m).length) withFiles++;
      if ((m?.embeds ?? []).length) withEmbeds++;
      if (m?.webhook_id) webhooks++;
      if ((m?.message_snapshots ?? []).length) forwards++;
      for (const a of filesOf(m)) files.push(a?.filename ?? '?');
      for (const e of m?.embeds ?? []) {
        if (e?.image?.url) files.push(`embed:${String(e.image.url).split('/').pop()?.split('?')[0]}`);
      }
    }

    log('');
    log('what came back, by shape:');
    log(`  ${withText}/${messages.length} have text`);
    log(`  ${withFiles}/${messages.length} have attachments`);
    log(`  ${withEmbeds}/${messages.length} have embeds`);
    log(`  ${webhooks}/${messages.length} arrived by webhook (a follow crossposts this way)`);
    log(`  ${forwards}/${messages.length} are forwards (content lives in message_snapshots)`);
    log(`  message types: ${[...kinds].map(([k, n]) => `${k}×${n}`).join(', ')}`);
    const shapes = new Map();
    for (const m of messages) {
      const keys = Object.keys(m ?? {}).sort().join(',');
      shapes.set(keys, (shapes.get(keys) ?? 0) + 1);
    }
    for (const [keys, n] of shapes) log(`  ${n} message(s) carry: ${keys}`);
    if (files.length) log(`  files: ${files.slice(0, 40).join(' ')}`);
    log(`  text lengths: ${messages.map((m) => textOf(m).length).join(' ')}`);
    log('');
  }

  const written = messages.filter((m) => WRITTEN_BY_A_PERSON.has(m?.type ?? 0));
  const silent = written.filter(
    (m) => !textOf(m) && filesOf(m).length === 0 && (m?.embeds ?? []).length === 0
  ).length;
  if (written.length >= 10 && silent === written.length) {
    throw new Error(
      `all ${written.length} messages written by a person came back with empty content, ` +
        'attachments and embeds — that is what Discord returns without the Message ' +
        'Content privileged intent. Turn it on: Developer Portal -> your app -> Bot -> ' +
        'Privileged Gateway Intents -> MESSAGE CONTENT INTENT.'
    );
  }

  const sets = revealsFromMessages(messages, released);
  const cardCount = sets.reduce((n, s) => n + s.cards.length, 0);

  if (sets.length === 0 && !fixture) {
    const held = await readFile(OUT, 'utf8').catch(() => null);
    if (held) {
      log('no reveals in this batch — keeping what is on disk');
      const previous = JSON.parse(held);
      const seen = newestId(messages) ?? previous.lastMessageId ?? null;
      await writeFile(OUT, JSON.stringify({ ...previous, lastMessageId: seen }));
      return;
    }
  }

  const previous = await readFile(OUT, 'utf8')
    .then((raw) => JSON.parse(raw))
    .catch(() => ({ sets: [] }));

  const merged = new Map(previous.sets?.map((s) => [s.set, s]) ?? []);
  for (const set of sets) {
    const held = merged.get(set.set);
    if (!held) {
      merged.set(set.set, set);
      continue;
    }
    const byId = new Map(held.cards.map((c) => [c.id, c]));
    for (const card of set.cards) {
      if (!byId.has(card.id)) byId.set(card.id, card);
      else {
        const held = byId.get(card.id);
        if (card.image) held.image = card.image;
        if (card.thumb && !held.thumb) held.thumb = card.thumb;
        if (card.name) held.name = card.name;
        if (card.text) held.text = card.text;
      }
    }
    merged.set(set.set, {
      set: set.set,
      cards: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
      first: [held.first, set.first].filter(Boolean).sort()[0] ?? null,
      last: [held.last, set.last].filter(Boolean).sort().at(-1) ?? null,
    });
  }

  for (const set of [...merged.keys()]) {
    if (!released.has(set.toUpperCase())) continue;
    log(`  ${set} has shipped — dropping it and its thumbnails`);
    for (const card of merged.get(set).cards) {
      if (card.thumb) await rm(path.join(THUMBS, card.thumb), { force: true });
    }
    merged.delete(set);
  }

  if (!fixture && !has('no-images')) {
    const held = new Set(await readdir(THUMBS).catch(() => []));
    for (const set of merged.values()) {
      for (const card of set.cards) {
        if (card.thumb && !held.has(card.thumb)) card.thumb = null;
      }
    }

    const wanted = [...merged.values()].flatMap((set) =>
      set.cards.filter((c) => c.image && !c.thumb).map((c) => c)
    );

    if (wanted.length > 0) {
      const sharp = await import('sharp').then((m) => m.default).catch(() => null);
      if (!sharp) {
        log('  sharp is not installed — keeping the numbers and no pictures');
      } else {
        let made = 0;
        let bytes = 0;
        for (const card of wanted) {
          const thumb = await thumbnail(card.id, card.image, sharp);
          if (!thumb) continue;
          card.thumb = thumb.file;
          made++;
          bytes += thumb.bytes;
        }
        log(
          `  ${made}/${wanted.length} thumbnails written` +
            (made ? ` (${(bytes / made / 1024).toFixed(0)} KB each, ${(bytes / 1024).toFixed(0)} KB total)` : '')
        );
      }
    }
  }

  const keep = new Set([...merged.values()].flatMap((s) => s.cards.map((c) => c.thumb).filter(Boolean)));
  for (const file of await readdir(THUMBS).catch(() => [])) {
    if (file.endsWith('.webp') && !keep.has(file)) {
      await rm(path.join(THUMBS, file), { force: true });
      log(`  removed an orphaned thumbnail: ${file}`);
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: { id: 'discord', label: 'Discord', channel: fixture ? null : CHANNEL },
    lastMessageId: newestId(messages) ?? previous.lastMessageId ?? null,
    counts: {
      sets: merged.size,
      cards: [...merged.values()].reduce((n, s) => n + s.cards.length, 0),
      messages: messages.length,
    },
    sets: [...merged.values()].sort((a, b) => String(b.last ?? '').localeCompare(String(a.last ?? ''))),
    durationMs: Date.now() - started,
  };

  await mkdir(DATA, { recursive: true });
  await writeFile(OUT, JSON.stringify(out));

  log(`${cardCount} cards in this batch · ${out.counts.cards} on record across ${out.counts.sets} sets`);
  for (const set of out.sets) log(`  ${set.set.padEnd(6)} ${String(set.cards.length).padStart(3)} cards`);
}

main().catch(async (err) =>
  exitOnFailure('discord', err, 'nothing written; the archive keeps the reveals it had', {
    since: await writtenAt(OUT),
  })
);
