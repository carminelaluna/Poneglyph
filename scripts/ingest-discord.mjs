#!/usr/bin/env node
/**
 * Poneglyph — card reveals from a Discord channel.
 *
 *   node scripts/ingest-discord.mjs [--limit N] [--all] [--fixture <file>]
 *
 * The web source we had publishes a leak article and then leaves it alone: both
 * of its articles were last *modified* twelve days before anybody noticed the
 * spoilers page had stopped moving. Reveals reach a community channel within
 * minutes and keep arriving one card at a time, which is the shape this archive
 * wants.
 *
 * ## What has to exist before this runs
 *
 * A Discord **bot**, not a user token — automating a user account is against
 * Discord's terms, and this reads with `GET /channels/{id}/messages` as an app.
 *
 * 1. Create an application at https://discord.com/developers/applications and add
 *    a bot to it.
 * 2. Turn on the **Message Content** privileged intent. It is a checkbox for an
 *    app this size, and it is not optional: without it Discord returns `content`,
 *    `embeds` and `attachments` **empty**, so this ingest reads a channel full of
 *    reveals and correctly finds nothing in it.
 * 3. Invite the bot to the server with **View Channel** and **Read Message
 *    History**. Inviting needs Manage Server on that guild.
 * 4. Set two repository secrets: `DISCORD_BOT_TOKEN` and `DISCORD_SPOILER_CHANNEL`.
 *
 * The token bypasses nothing but it reads a private channel, so it belongs in
 * Actions secrets and never in `.env.local` — and never under a `NEXT_PUBLIC_`
 * name, which would compile it into the browser bundle.
 *
 * ## What it writes
 *
 * `data/spoilers-discord.json`, its own corpus, which `ingest-spoilers.mjs` folds
 * in as a second source the way `build-indexes.mjs` folds in community decks. It
 * does not write any `public/data` payload: one writer per payload, which is the
 * rule the Top Decks ingest learned by leaving a 0 KB index behind.
 *
 * Images are **not** downloaded here. Discord's CDN links are signed and expire
 * within hours, so a URL saved into a static JSON file is dead by the time most
 * readers see it. What to do about that is a separate decision with a policy
 * attached — these are photographs of cards that are not out — so this records
 * the link it saw and leaves the choice to the step that would act on it.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
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
/*
 * `--out` exists for the tests, and it exists because they wrote to the real one.
 * A test that spawns this script has to clean up after itself, and cleaning up
 * meant deleting `data/spoilers-discord.json` — which on any checkout that has a
 * corpus is not cleanup, it is data loss, one `npm test` away.
 */
const OUT = path.resolve(flag('out', path.join(DATA, 'spoilers-discord.json')));
const log = (...m) => console.log('[discord]', ...m);

const TOKEN = process.env.DISCORD_BOT_TOKEN ?? '';
const CHANNEL = process.env.DISCORD_SPOILER_CHANNEL ?? '';
const API = 'https://discord.com/api/v10';

/** Discord's own cap on one page of message history. */
const PAGE = 100;

/**
 * Application flags that say the Message Content intent is on.
 *
 * `GATEWAY_MESSAGE_CONTENT` (1 << 18) is the approved one, for apps in 100 or
 * more servers; `GATEWAY_MESSAGE_CONTENT_LIMITED` (1 << 19) is the self-serve one
 * a small app switches on for itself. Either means content will arrive, so either
 * answers the question, and asking `GET /applications/@me` answers it about the
 * token we are actually holding rather than about whichever app somebody was
 * looking at in the portal.
 */
const MESSAGE_CONTENT_FLAGS = { approved: 1 << 18, limited: 1 << 19 };

/**
 * Message types a person actually wrote: DEFAULT, REPLY, and the two command
 * kinds. Everything else — joins, pins, boosts, and the `CHANNEL_FOLLOW_ADD` that
 * Discord posts when a channel is followed into this one — is written by Discord.
 *
 * The distinction is load-bearing, not tidiness. The check below asks whether the
 * messages came back blank, which is the signature of a missing Message Content
 * intent, and system messages carry text of their own that is not gated by it. A
 * single follow-add notice among twelve blank posts was enough to hide exactly
 * that failure on the first real run.
 */
const WRITTEN_BY_A_PERSON = new Set([0, 19, 20, 23]);

/**
 * How far back a first run reads.
 *
 * A channel that has been running for years is not worth walking to the start:
 * everything old is a set that shipped, and `revealsFromMessages` would drop all
 * of it anyway. Later runs read forward from the last id instead, so this cap
 * only ever applies once.
 */
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

      /*
       * 401 and 403 are ours to fix, not Discord's mood: a bad token, or a bot
       * that was never invited to the channel. Failing on those is the point —
       * they are silent forever otherwise, which is exactly how the last source
       * went stale for five days under a wall of green ticks.
       */
      if (res.status === 401) throw new Error('401 — DISCORD_BOT_TOKEN is missing or wrong');
      /*
       * Permissions, and only permissions. A missing Message Content intent does
       * not produce a 403 — it produces a 200 whose fields are empty, which is
       * caught further down. Saying both here sent somebody looking at the wrong
       * checkbox, so this now says the one thing a 403 actually means.
       */
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

/** What the last run reached, so this one reads forward rather than again. */
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
    /*
     * `after` walks forward from the last id and `before` walks backward from
     * now. A first run has no id to walk from, so it pages backward and stops;
     * every run after that walks forward and stops when it catches up.
     */
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

  /*
   * The set prefixes already in the archive. A channel talks about released cards
   * all day — deck advice, a reprint, a price — so without this the spoilers page
   * would announce OP-01 as an unreleased set.
   */
  const cards = JSON.parse(await readFile(path.join(DATA, 'cards.json'), 'utf8'));
  const released = new Set(cards.map((c) => c.id.split('-')[0].toUpperCase()));
  log(`${released.size} set prefixes already in the card archive`);

  const fixture = flag('fixture');
  let messages;

  if (fixture) {
    /* The mapping and the merge, provable before a bot or a token exists. */
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

  /*
   * `--inspect` answers the two questions you cannot answer from "0 cards": is the
   * Message Content intent actually on, and do crossposted messages keep their
   * attachments? Both are visible in the *shape* of what came back.
   *
   * It deliberately prints no message text. Actions logs on a public repository
   * are public, and this is somebody's community channel: counts, lengths,
   * message types and attachment filenames are enough to diagnose every failure
   * this source has, and none of them is the conversation.
   */
  if (has('inspect')) {
    /*
     * The definitive answer, from Discord, about this token. Two runs were spent
     * inferring the intent from the shape of what came back; the application
     * object simply says. It also names the app, which is the other thing that
     * goes wrong: toggling the intent on one application and putting a different
     * one's token in the secret looks exactly the same from the outside.
     */
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
    /*
     * Field names only, never values. A message whose content lives somewhere
     * unexpected — a forward puts it in `message_snapshots`, a sticker in
     * `sticker_items` — is indistinguishable from a blank one until you can see
     * which keys are actually present.
     */
    const shapes = new Map();
    for (const m of messages) {
      const keys = Object.keys(m ?? {}).sort().join(',');
      shapes.set(keys, (shapes.get(keys) ?? 0) + 1);
    }
    for (const [keys, n] of shapes) log(`  ${n} message(s) carry: ${keys}`);
    if (files.length) log(`  files: ${files.slice(0, 40).join(' ')}`);
    /* Text length only — enough to tell "blank" from "we did not match it". */
    log(`  text lengths: ${messages.map((m) => textOf(m).length).join(' ')}`);
    log('');
  }

  /*
   * The failure that looks like success, and the reason this check exists.
   *
   * Without the Message Content privileged intent Discord answers 200 and blanks
   * `content`, `embeds` and `attachments`. Every message arrives, none of them
   * says anything, and the run reports zero cards and goes green — which is
   * indistinguishable from a quiet channel and would sit there for weeks. A
   * channel of reveals whose every message is empty is not a quiet channel.
   */
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

  /*
   * An empty read is not a reason to forget what is recorded. Same rule as
   * `corpus-guard.mjs`, and the same reason: an upstream having a quiet morning
   * must not be able to empty the archive. Here it is simpler, because a channel
   * genuinely can go quiet — so nothing found means nothing written, and what is
   * on disk stands.
   */
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

  /* Merged, because a batch only carries what arrived since the last run. */
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
      else if (card.image && !byId.get(card.id).image) byId.get(card.id).image = card.image;
    }
    merged.set(set.set, {
      set: set.set,
      cards: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
      first: [held.first, set.first].filter(Boolean).sort()[0] ?? null,
      last: [held.last, set.last].filter(Boolean).sort().at(-1) ?? null,
    });
  }

  /* A set that shipped since the last run stops being a spoiler. */
  for (const set of [...merged.keys()]) {
    if (released.has(set.toUpperCase())) {
      log(`  ${set} has shipped — dropping it from the spoiler corpus`);
      merged.delete(set);
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
