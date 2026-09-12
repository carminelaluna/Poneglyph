import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import os from 'node:os';
import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';
import {
  cardIds,
  cardsFromMessage,
  cleanMarkup,
  describe as describeCard,
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

  it('pairs a typed number with the one photo beside it', () => {
    const [card] = cardsFromMessage(messages[2]);
    assert.equal(card.id, 'OP18-060');
    assert.match(card.image, /IMG_4822\.jpg/);
  });

  it('refuses to guess which of several cards a lone photo shows', () => {
    const cards = cardsFromMessage(messages[3]);
    assert.deepEqual(cards.map((c) => c.id).sort(), ['OP18-101', 'OP18-102', 'OP18-103']);
    assert.ok(
      cards.every((c) => c.image === null),
      'a photo was attached to a card it may not show'
    );
  });

  it('reads a forwarded message, whose content is in the snapshot', () => {
    const [card] = cardsFromMessage(messages[7]);
    assert.equal(card.id, 'OP18-077');
    assert.match(card.image, /OP18-077\.png/);
  });

  it('keeps the text a reveal was posted with', () => {
    const [card] = cardsFromMessage(messages[8]);
    assert.equal(card.id, 'EB05-018');
    assert.match(card.text, /ナミ/, 'the translation was dropped');
    assert.ok(!card.text.includes('EB05-018'), 'the number is printed beside it already');
    assert.equal(card.name, null);
    assert.match(card.image, /IMG_9001/, 'the lone photo still pairs with the one card');
  });

  it('will not put one card’s text under another’s number', () => {
    const cards = cardsFromMessage(messages[3]);
    assert.equal(cards.length, 3);
    assert.ok(cards.every((c) => c.text === null));
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
    assert.match(op18.last, /^2026-09-02T10:00/);
  });

  it('puts the set with the newest sighting first', () => {
    assert.equal(reveals[0].set, 'EB05');
    assert.equal(reveals[1].set, 'OP18');
  });

  it('is empty rather than throwing on an empty channel', () => {
    assert.deepEqual(revealsFromMessages([], released), []);
  });
});

describe('mentions do not become card text', () => {
  it('strips a mention already resolved to its name', () => {
    assert.equal(cleanMarkup('Purple Character C @Card Reveals'), 'Purple Character C');
    assert.equal(cleanMarkup('Yellow Character C @Card Reveals'), 'Yellow Character C');
  });

  it('still strips the raw form, and the two together', () => {
    assert.equal(cleanMarkup('Red Character C <@&1370648885474889869>'), 'Red Character C');
    assert.equal(cleanMarkup('Red C <@&137> @Card Reveals'), 'Red C');
  });

  it('strips the broadcast pings', () => {
    assert.equal(cleanMarkup('OP18-021 Red Character SR @everyone'), 'OP18-021 Red Character SR');
    assert.equal(cleanMarkup('New set @here'), 'New set');
  });

  it('leaves real card text alone', () => {
    const rules = 'Draw 1 card. Then, if you have 5 or more cards, K.O. 1 Character.';
    assert.equal(cleanMarkup(rules), rules);
    assert.equal(cleanMarkup('Monkey.D.Luffy Red Leader L'), 'Monkey.D.Luffy Red Leader L');
    assert.equal(cleanMarkup('Gum-Gum @ Giant'), 'Gum-Gum @ Giant');
  });

  it('leaves nothing behind when the post was only a ping', () => {
    assert.equal(cleanMarkup('@Card Reveals'), '');
    assert.deepEqual(describeCard('@Card Reveals', 'EB05-038'), { name: null, text: null });
  });
});

describe('the text a reveal carries', () => {
  it('splits the name off at the colour', () => {
    const r = describeCard('``` Belo Betty Red Character C``` <@&137>', 'EB05-005');
    assert.equal(r.name, 'Belo Betty');
    assert.equal(r.text, 'Red Character C');
  });

  it('keeps a cost, a power and an ability when they are there', () => {
    const r = describeCard(
      '``` Shinobu Black Character C 4 Cost / 5000 Power Counter +2000 [On Play] Draw 2 cards.``` <@&137>',
      'EB05-042'
    );
    assert.equal(r.name, 'Shinobu');
    assert.match(r.text ?? '', /\[On Play\] Draw 2 cards\./);
  });

  it('takes Discord’s markup out, mentions included', () => {
    const r = describeCard('``` Monet Red Character C ``` <@&1370648885474889869>', 'EB05-007');
    assert.ok(!/[`<>@&]/.test(r.text ?? ''), `markup survived: ${r.text}`);
    assert.ok(!/\d{6,}/.test(r.text ?? ''), 'a mention id reached the page');
  });

  it('takes the number out, since the page prints it alongside', () => {
    const r = describeCard('EB05-007 Monet Red Character C', 'EB05-007');
    assert.equal(r.name, 'Monet');
    assert.ok(!(r.text ?? '').includes('EB05-007'));
  });

  it('says nothing rather than something useless', () => {
    assert.deepEqual(describeCard('EB05-007', 'EB05-007'), { name: null, text: null });
    assert.deepEqual(describeCard('lol', 'EB05-007'), { name: null, text: null });
    assert.deepEqual(describeCard('', 'EB05-007'), { name: null, text: null });
    assert.deepEqual(describeCard(null, 'EB05-007'), { name: null, text: null });
  });

  it('claims no name when the colour is the first word', () => {
    assert.equal(describeCard('``` Red Character C ```', 'EB05-009').name, null);
  });

  it('refuses an essay', () => {
    assert.deepEqual(describeCard('x'.repeat(900), 'EB05-007'), { name: null, text: null });
  });
});

describe('where the next run starts', () => {
  it('takes the newest id, comparing as numbers not strings', () => {
    assert.equal(newestId(messages), '1310000000000000009');
    assert.equal(newestId([{ id: '9999999999999999' }, { id: '10000000000000000' }]), '10000000000000000');
  });

  it('has nothing to say about an empty batch', () => {
    assert.equal(newestId([]), null);
    assert.equal(newestId([{ id: 'not-a-snowflake' }]), null);
  });
});

describe('the ingest script', () => {
  const run = promisify(execFile);
  const out = path.join(os.tmpdir(), `poneglyph-discord-${process.pid}.json`);
  const thumbs = path.join(os.tmpdir(), `poneglyph-thumbs-${process.pid}`);
  const spawn = (args: string[], env: Record<string, string> = {}) =>
    run(
      process.execPath,
      [
        path.join(root, 'scripts', 'ingest-discord.mjs'),
        '--out',
        out,
        '--thumbs',
        thumbs,
        ...args,
      ],
      {
        cwd: root,
        env: { ...process.env, DISCORD_BOT_TOKEN: '', DISCORD_SPOILER_CHANNEL: '', ...env },
      }
    );

  it('reads a fixture end to end and writes a corpus', async (t) => {
    t.after(() => rm(out, { force: true }));
    const { stdout } = await spawn(['--fixture', 'tests/fixtures/discord-messages.json']);
    assert.match(stdout, /2 sets/);

    const written = JSON.parse(await readFile(out, 'utf8'));
    assert.deepEqual(written.sets.map((s: { set: string }) => s.set).sort(), ['EB05', 'OP18']);
    assert.equal(written.counts.cards, 8);
    assert.equal(written.lastMessageId, '1310000000000000009', 'the next run must start after this');
  });

  it('merges rather than duplicating when it runs again', async (t) => {
    t.after(() => rm(out, { force: true }));
    await spawn(['--fixture', 'tests/fixtures/discord-messages.json']);
    await spawn(['--fixture', 'tests/fixtures/discord-messages.json']);
    const written = JSON.parse(await readFile(out, 'utf8'));
    assert.equal(written.counts.cards, 8);
  });

  it('leaves the real thumbnails alone', async (t) => {
    t.after(() => rm(out, { force: true }));
    const real = path.join(root, 'public', 'spoilers');
    const before = await readdir(real).catch(() => []);
    await spawn(['--fixture', 'tests/fixtures/discord-messages.json']);
    const after = await readdir(real).catch(() => []);
    assert.deepEqual(after, before, 'the test suite deleted thumbnails the site serves');
  });

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

  it('fails loudly when it has no token to use', async () => {
    await assert.rejects(spawn([]), (err: NodeJS.ErrnoException & { code?: number; stderr?: string }) => {
      assert.equal(err.code, 1);
      assert.match(err.stderr ?? '', /DISCORD_BOT_TOKEN and DISCORD_SPOILER_CHANNEL/);
      return true;
    });
  });
});
