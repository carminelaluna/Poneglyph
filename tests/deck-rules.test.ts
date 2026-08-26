/**
 * The deck rules, checked against the cases that produced them.
 *
 * `src/lib/deck-rules.ts` is free of imports precisely so it can run here the way
 * the builder and the submission form run it — no DOM, no fetch, no card archive.
 * Every case below is either a rule Bandai states or a bug this repo has actually
 * shipped; the banned-Leader ones are the second kind.
 *
 *   npm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DECK_SIZE,
  MAX_COPIES,
  colorsMatch,
  parseDeckList,
  totalCards,
  validate,
  type Banlist,
  type Counted,
  type DeckCard,
  type Leader,
  type Problem,
} from '../src/lib/deck-rules.ts';

/* ---------------------------------------------------------------- fixtures */

const card = (over: Partial<DeckCard> & { id: string }): DeckCard => ({
  name: over.id,
  colors: ['Red'],
  category: 'Character',
  standard: 1,
  ...over,
});

const leader = (over: Partial<Leader> = {}): Leader => ({
  id: 'OP01-001',
  name: 'Roronoa Zoro',
  colors: ['Red'],
  category: 'Leader',
  standard: 1,
  life: 5,
  ...over,
});

const EMPTY: Banlist = { banned: [], restricted: [], pairs: [] };

/** Fifty legal cards, as four-ofs plus a remainder — the shape of a real deck. */
function fiftyCards(total = DECK_SIZE): Counted[] {
  const deck: Counted[] = [];
  let left = total;
  let n = 0;
  while (left > 0) {
    const count = Math.min(MAX_COPIES, left);
    deck.push({ card: card({ id: `OP01-${String(100 + n).padStart(3, '0')}` }), count });
    left -= count;
    n++;
  }
  return deck;
}

const errors = (problems: Problem[]) => problems.filter((p) => p.kind === 'error');
const warnings = (problems: Problem[]) => problems.filter((p) => p.kind === 'warning');

/* ------------------------------------------------------------------ counts */

describe('deck size', () => {
  it('accepts a legal deck without complaint', () => {
    assert.deepEqual(validate(leader(), fiftyCards(), EMPTY, 'Standard'), []);
  });

  it('counts copies rather than entries', () => {
    assert.equal(totalCards(fiftyCards()), DECK_SIZE);
  });

  it('says how many cards are missing', () => {
    const found = errors(validate(leader(), fiftyCards(49), EMPTY, 'Standard'));
    assert.equal(found.length, 1);
    assert.match(found[0].message, /1 more card needed/);
  });

  it('says how many cards are too many', () => {
    const found = errors(validate(leader(), fiftyCards(52), EMPTY, 'Standard'));
    assert.equal(found.length, 1);
    assert.match(found[0].message, /2 too many/);
  });

  it('needs a Leader before anything else', () => {
    const found = validate(null, fiftyCards(), EMPTY, 'Standard');
    assert.equal(found.length, 1);
    assert.match(found[0].message, /Pick a Leader/);
  });
});

describe('copy limit', () => {
  it('refuses a fifth copy of one card number', () => {
    /* 45 + 5 is fifty, so the only thing wrong here is the copy count. */
    const deck = fiftyCards(45);
    deck.push({ card: card({ id: 'OP01-025', name: 'Nami' }), count: 5 });
    const found = errors(validate(leader(), deck, EMPTY, 'Standard'));
    assert.equal(found.length, 1);
    assert.match(found[0].message, /5 copies, and 4 is the limit/);
  });

  it('refuses a Leader among the fifty', () => {
    const deck = fiftyCards(46);
    deck.push({ card: card({ id: 'OP02-001', category: 'Leader', name: 'Sakazuki' }), count: 4 });
    const found = errors(validate(leader(), deck, EMPTY, 'Standard'));
    assert.equal(found.length, 1);
    assert.match(found[0].message, /is a Leader and cannot be in the deck/);
  });
});

/* ----------------------------------------------------------------- banlist */

describe('the banned list', () => {
  const banlist: Banlist = {
    banned: ['OP03-040', 'OP04-104'],
    restricted: ['OP05-060'],
    pairs: [['OP11-040', 'OP06-069']],
  };

  it('refuses a banned card in the deck', () => {
    const deck = fiftyCards(46);
    deck.push({ card: card({ id: 'OP04-104', name: 'Rob Lucci' }), count: 4 });
    const found = errors(validate(leader(), deck, banlist, 'Standard'));
    assert.equal(found.length, 1);
    assert.match(found[0].message, /Rob Lucci is banned/);
  });

  /*
   * The regression this file exists for. `validate` compared the banlist against
   * the fifty only, so a Leader that is itself banned — two of the five are —
   * reported the deck as legal.
   */
  it('refuses a banned Leader', () => {
    const found = errors(
      validate(leader({ id: 'OP03-040', name: 'Nami' }), fiftyCards(), banlist, 'Standard')
    );
    assert.equal(found.length, 1);
    assert.match(found[0].message, /Nami is banned as a Leader/);
  });

  it('refuses a banned pair whose first half is the Leader', () => {
    const deck = fiftyCards(46);
    deck.push({ card: card({ id: 'OP06-069', name: 'Charlotte Katakuri' }), count: 4 });
    const found = errors(validate(leader({ id: 'OP11-040' }), deck, banlist, 'Standard'));
    assert.equal(found.length, 1);
    assert.match(found[0].message, /cannot be in the same deck/);
  });

  it('leaves the pair alone when only one half is present', () => {
    assert.deepEqual(
      errors(validate(leader({ id: 'OP11-040' }), fiftyCards(), banlist, 'Standard')),
      []
    );
  });

  it('allows one copy of a restricted card and refuses two', () => {
    const one = fiftyCards(49);
    one.push({ card: card({ id: 'OP05-060', name: 'Bellamy' }), count: 1 });
    assert.deepEqual(errors(validate(leader(), one, banlist, 'Standard')), []);

    const two = fiftyCards(48);
    two.push({ card: card({ id: 'OP05-060', name: 'Bellamy' }), count: 2 });
    const found = errors(validate(leader(), two, banlist, 'Standard'));
    assert.equal(found.length, 1);
    assert.match(found[0].message, /restricted to one copy/);
  });
});

/* ---------------------------------------------------------------- rotation */

describe('rotation', () => {
  it('refuses a rotated card in Standard and allows it in Extra', () => {
    const deck = fiftyCards(46);
    deck.push({ card: card({ id: 'ST01-006', name: 'Jinbe', standard: 0 }), count: 4 });
    assert.equal(errors(validate(leader(), deck, EMPTY, 'Standard')).length, 1);
    assert.deepEqual(errors(validate(leader(), deck, EMPTY, 'Extra')), []);
  });

  it('refuses a rotated Leader in Standard', () => {
    const found = errors(validate(leader({ standard: 0 }), fiftyCards(), EMPTY, 'Standard'));
    assert.equal(found.length, 1);
    assert.match(found[0].message, /rotated out of Standard/);
  });
});

/* ------------------------------------------------------------------ colour */

describe('the colour rule', () => {
  it('is a warning, never an error', () => {
    const deck = fiftyCards(46);
    deck.push({ card: card({ id: 'OP02-093', name: 'Kuzan', colors: ['Blue'] }), count: 4 });
    const problems = validate(leader(), deck, EMPTY, 'Standard');
    assert.deepEqual(errors(problems), []);
    assert.equal(warnings(problems).length, 1);
  });

  it('accepts a card whose colours are a subset of the Leader', () => {
    const twoColour = leader({ colors: ['Red', 'Green'] });
    assert.ok(colorsMatch(twoColour, card({ id: 'OP01-025', colors: ['Green'] })));
    assert.ok(colorsMatch(twoColour, card({ id: 'OP01-026', colors: ['Red', 'Green'] })));
    assert.ok(!colorsMatch(twoColour, card({ id: 'OP01-027', colors: ['Red', 'Blue'] })));
  });
});

/* -------------------------------------------------------------- the parser */

describe('parseDeckList', () => {
  it('reads the four shapes that turn up in the wild', () => {
    const parsed = parseDeckList(
      ['4xOP01-025', '3x OP01-026', '2 OP01-027', 'OP01-028 x1'].join('\n')
    );
    assert.deepEqual(parsed, [
      { id: 'OP01-025', count: 4 },
      { id: 'OP01-026', count: 3 },
      { id: 'OP01-027', count: 2 },
      { id: 'OP01-028', count: 1 },
    ]);
  });

  it('skips blank lines and comments rather than failing', () => {
    const parsed = parseDeckList('# my deck\n\n4xOP01-025\n// note\n\n2xOP01-026');
    assert.deepEqual(parsed, [
      { id: 'OP01-025', count: 4 },
      { id: 'OP01-026', count: 2 },
    ]);
  });

  it('strips the printing suffix so one playset stays one entry', () => {
    assert.deepEqual(parseDeckList('2xOP01-025_p1\n2xOP01-025'), [
      { id: 'OP01-025', count: 4 },
    ]);
  });

  it('uppercases the card number', () => {
    assert.deepEqual(parseDeckList('4x op01-025'), [{ id: 'OP01-025', count: 4 }]);
  });

  it('does not clamp an over-count — the validator is what says so', () => {
    assert.deepEqual(parseDeckList('6xOP01-025'), [{ id: 'OP01-025', count: 6 }]);
  });

  it('reads a Leader line with a count in front of it', () => {
    assert.deepEqual(parseDeckList('1xOP01-001\n4xOP01-025'), [
      { id: 'OP01-001', count: 1 },
      { id: 'OP01-025', count: 4 },
    ]);
  });

  it('gives nothing back for nothing, rather than throwing', () => {
    assert.deepEqual(parseDeckList(''), []);
    assert.deepEqual(parseDeckList('not a decklist at all'), []);
    assert.deepEqual(parseDeckList(null as unknown as string), []);
  });
});
