/**
 * Reading card reveals out of Discord messages.
 *
 * Everything else about this source needs a bot token and a server, so the part
 * worth testing is deliberately the part that needs neither: messages in, cards
 * out. The fixture is the shapes a channel actually produces — a scan named for
 * its card, a phone photo named IMG_4821 beside a typed number, a dump of six
 * numbers with one useless picture, and a reprint of a card that shipped in 2022.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';
import {
  cardIds,
  cardsFromMessage,
  newestId,
  revealsFromMessages,
  setOf,
} from '../scripts/discord.mjs';

const root = path.resolve(import.meta.dirname, '..');
const messages = JSON.parse(
  await readFile(path.join(root, 'tests', 'fixtures', 'discord-messages.json'), 'utf8')
);

describe('finding card numbers in text', () => {
  it('reads the shapes this game writes', () => {
    assert.deepEqual([...cardIds('OP18-021 is nuts')], ['OP18-021']);
    assert.deepEqual([...cardIds('op18-021')], ['OP18-021'], 'lowercase is how people type');
    assert.deepEqual([...cardIds('P-122 promo')], ['P-122'], 'promos carry no set number');
    assert.deepEqual([...cardIds('EB05-016 and OP18-060')], ['EB05-016', 'OP18-060']);
  });

  /*
   * The guard that stops a resize suffix becoming a card. `-1024x768` is what a
   * phone and WordPress both append, and `1024` starts with three digits.
   */
  it('is not fooled by an image resize suffix', () => {
    assert.deepEqual([...cardIds('eb05-1024x768.jpg')], []);
    assert.deepEqual([...cardIds('prb22-1024x461.jpeg')], []);
    assert.deepEqual([...cardIds('OP18-0211')], [], 'a fourth digit is not a card number');
  });

  it('says which set an id belongs to', () => {
    assert.equal(setOf('OP18-021'), 'OP18');
    assert.equal(setOf('P-122'), 'P');
  });
});

describe('one message', () => {
  it('takes the card from a scan named for it', () => {
    const [card] = cardsFromMessage(messages[0]);
    assert.equal(card.id, 'OP18-021');
    assert.match(card.image, /OP18-021\.png/);
  });

  /*
   * The common case, and the reason text is read at all: a photo of a card with
   * the number typed beside it. The picture is named IMG_4822 and means nothing
   * on its own; the pairing is what makes it usable.
   */
  it('pairs a typed number with the one photo beside it', () => {
    const [card] = cardsFromMessage(messages[2]);
    assert.equal(card.id, 'OP18-060');
    assert.match(card.image, /IMG_4822\.jpg/);
  });

  /*
   * Six numbers and one picture: the picture is evidence about none of them, and
   * attaching it to whichever was named first would put the wrong art on a card.
   */
  it('refuses to guess which of several cards a lone photo shows', () => {
    const cards = cardsFromMessage(messages[3]);
    assert.deepEqual(cards.map((c) => c.id).sort(), ['OP18-101', 'OP18-102', 'OP18-103']);
    assert.ok(
      cards.every((c) => c.image === null),
      'a photo was attached to a card it may not show'
    );
  });

  /*
   * A forward is empty at the top level and carries the real message in
   * `message_snapshots`. It is not an edge case: it is how the channel this reads
   * is actually fed, and reading only the top level saw twelve posts, found
   * nothing in any of them, and looked exactly like a missing Message Content
   * intent — which cost two runs to tell apart.
   */
  it('reads a forwarded message, whose content is in the snapshot', () => {
    const [card] = cardsFromMessage(messages[7]);
    assert.equal(card.id, 'OP18-077');
    assert.match(card.image, /OP18-077\.png/);
  });

  it('finds nothing in a message with nothing in it', () => {
    assert.deepEqual(cardsFromMessage(messages[6]), []);
    assert.deepEqual(cardsFromMessage({}), []);
    assert.deepEqual(cardsFromMessage(undefined), []);
  });
});

describe('a batch of messages', () => {
  const released = new Set(['OP01', 'OP02', 'ST01']);
  const reveals = revealsFromMessages(messages, released);

  /*
   * A channel talks about released cards all day. Without this the page would
   * announce OP-01 as an unreleased set because somebody mentioned a reprint.
   */
  it('drops sets the archive already has', () => {
    assert.ok(!reveals.some((r) => r.set === 'OP01'), 'a 2022 reprint became a spoiler');
  });

  it('groups what is left by set', () => {
    assert.deepEqual(reveals.map((r) => r.set).sort(), ['EB05', 'OP18']);
    const op18 = reveals.find((r) => r.set === 'OP18')!;
    assert.deepEqual(op18.cards.map((c) => c.id), [
      'OP18-021',
      'OP18-060',
      'OP18-077',
      'OP18-101',
      'OP18-102',
      'OP18-103',
    ]);
  });

  it('keeps the day each set was first and last seen', () => {
    const op18 = reveals.find((r) => r.set === 'OP18')!;
    assert.match(op18.first, /^2026-09-01T09:14/);
    /* The forward, which is the newest sighting of this set. */
    assert.match(op18.last, /^2026-09-02T10:00/);
  });

  /* Newest activity first: a set being revealed right now is the one to show. */
  it('puts the set with the newest sighting first', () => {
    assert.equal(reveals[0].set, 'OP18');
    assert.equal(reveals[1].set, 'EB05');
  });

  it('is empty rather than throwing on an empty channel', () => {
    assert.deepEqual(revealsFromMessages([], released), []);
  });
});

describe('where the next run starts', () => {
  /*
   * Snowflakes sort by time as integers. They sort by time as strings only while
   * they are all the same length, which is true today and has a date on which it
   * stops being true.
   */
  it('takes the newest id, comparing as numbers not strings', () => {
    assert.equal(newestId(messages), '1310000000000000008');
    assert.equal(newestId([{ id: '9999999999999999' }, { id: '10000000000000000' }]), '10000000000000000');
  });

  it('has nothing to say about an empty batch', () => {
    assert.equal(newestId([]), null);
    assert.equal(newestId([{ id: 'not-a-snowflake' }]), null);
  });
});

/*
 * The script itself, spawned.
 *
 * `--fixture` is the one mode that evaluates neither the token check nor the
 * fetch, which is exactly the trap `tests/ingest-submissions.test.ts` records:
 * extracting a helper out of that ingest took two module-level constants with it,
 * the change was checked with --fixture, and the scheduled run found it six hours
 * later. So this runs the script both ways and reads the exit code.
 */
describe('the ingest script', () => {
  const run = promisify(execFile);
  const out = path.join(root, 'data', 'spoilers-discord.json');
  const spawn = (args: string[], env: Record<string, string> = {}) =>
    run(process.execPath, [path.join(root, 'scripts', 'ingest-discord.mjs'), ...args], {
      cwd: root,
      /* Blank rather than absent, so a token in the shell cannot make this pass. */
      env: { ...process.env, DISCORD_BOT_TOKEN: '', DISCORD_SPOILER_CHANNEL: '', ...env },
    });

  it('reads a fixture end to end and writes a corpus', async (t) => {
    t.after(() => rm(out, { force: true }));
    const { stdout } = await spawn(['--fixture', 'tests/fixtures/discord-messages.json']);
    assert.match(stdout, /2 sets/);

    const written = JSON.parse(await readFile(out, 'utf8'));
    assert.deepEqual(written.sets.map((s: { set: string }) => s.set).sort(), ['EB05', 'OP18']);
    assert.equal(written.counts.cards, 7);
    assert.equal(written.lastMessageId, '1310000000000000008', 'the next run must start after this');
  });

  /* Running twice must not double the corpus, because a batch is a delta. */
  it('merges rather than duplicating when it runs again', async (t) => {
    t.after(() => rm(out, { force: true }));
    await spawn(['--fixture', 'tests/fixtures/discord-messages.json']);
    await spawn(['--fixture', 'tests/fixtures/discord-messages.json']);
    const written = JSON.parse(await readFile(out, 'utf8'));
    assert.equal(written.counts.cards, 7);
  });

  /*
   * The first real run, reproduced. Discord answered 200 with thirteen messages:
   * one CHANNEL_FOLLOW_ADD notice carrying its own text, and twelve posts from
   * people with content, attachments and embeds all blank — which is what a
   * missing Message Content intent looks like from the outside.
   *
   * The first version of this check asked whether *every* message was blank, and
   * that single system message defeated it: the run reported zero cards and went
   * green. System messages are written by Discord and their text is not gated by
   * the intent, so they cannot be part of the question.
   */
  it('names the missing intent when the messages come back blank', async () => {
    await assert.rejects(
      spawn(['--fixture', 'tests/fixtures/discord-gated.json']),
      (err: NodeJS.ErrnoException & { code?: number; stderr?: string }) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr ?? '', /12 messages written by a person/);
        assert.match(err.stderr ?? '', /MESSAGE CONTENT INTENT/);
        return true;
      }
    );
  });

  /*
   * Missing configuration is ours, not Discord's, so it fails rather than warning
   * — the whole point of the refusal split is that a green run means something.
   */
  it('fails loudly when it has no token to use', async () => {
    await assert.rejects(spawn([]), (err: NodeJS.ErrnoException & { code?: number; stderr?: string }) => {
      assert.equal(err.code, 1);
      /* exitOnFailure writes the reason to stderr; the annotations go to stdout. */
      assert.match(err.stderr ?? '', /DISCORD_BOT_TOKEN and DISCORD_SPOILER_CHANNEL/);
      return true;
    });
  });
});
