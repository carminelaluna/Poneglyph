/**
 * An organizer's tournament, becoming rows in the corpus.
 *
 * This is the only path into the metagame figures that a person types by hand, and
 * two of the mappings decide what the published numbers mean rather than how they
 * look. Both fail quietly:
 *
 * **sampling** carries "whole field" or "only the decks that placed" through to
 * every win rate. A winners-only event counted as a field reads near 100% and means
 * nothing at all.
 *
 * **placing** is read from a column called `place`, because PLACING is reserved in
 * PostgreSQL. Getting the rename wrong loses every finish in the event without
 * losing the event.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { named, toDecks } from '../scripts/submissions.mjs';

type Deck = {
  id: string;
  tournamentId: string;
  date: string;
  leaderId: string;
  leaderName: string;
  colors: string[];
  placing: number | null;
  record: { wins: number; losses: number; ties: number };
  players: number;
  eventName: string;
  player: string;
  venue: string;
  tier: string;
  cards: { id: string; count: number }[];
  sampling: 'field' | 'winners';
  region: 'EN' | 'JP';
  source: string;
  organizer: string | null;
};

const map = toDecks as (submission: unknown, cardsById?: Map<string, unknown>) => Deck[];

const archive = new Map([['OP13-001', { name: 'Monkey.D.Luffy', colors: ['Red', 'Green'] }]]);

const submission = (over: Record<string, unknown> = {}) => ({
  id: 'sub-1',
  event_name: 'Rialto Locals #14',
  event_date: '2026-08-23',
  venue: 'offline',
  tier: 'local',
  region: 'EN',
  sampling: 'field',
  players: 16,
  submission_decks: [
    {
      id: 'deck-1',
      player: 'Marta Bevilacqua',
      place: 1,
      wins: 4,
      losses: 0,
      ties: 0,
      leader_id: 'OP13-001',
      cards: [{ id: 'EB02-017', count: 4 }],
    },
  ],
  ...over,
});

describe('sampling', () => {
  it('carries a whole field through as a field', () => {
    assert.equal(map(submission({ sampling: 'field' }), archive)[0].sampling, 'field');
  });

  /*
   * Anything that is not exactly "field" is winners. The failure this guards runs
   * one way only: a winners-only event counted as a field invents a win rate, while
   * a field counted as winners merely declines to compute one.
   */
  it('treats anything else as winners only', () => {
    for (const value of ['winners', 'Field', '', null, undefined, 'top cut']) {
      assert.equal(
        map(submission({ sampling: value }), archive)[0].sampling,
        'winners',
        `sampling: ${String(value)}`
      );
    }
  });
});

describe('placing', () => {
  it('reads the place column into the corpus field', () => {
    assert.equal(map(submission(), archive)[0].placing, 1);
  });

  it('is null when the organizer did not record one, never zero', () => {
    for (const place of [null, undefined, 'first', NaN]) {
      const decks = map(
        submission({ submission_decks: [{ id: 'd', leader_id: 'OP13-001', place }] }),
        archive
      );
      assert.equal(decks[0].placing, null, `place: ${String(place)}`);
    }
  });

  it('keeps a placing of zero out, since there is no zeroth place', () => {
    const decks = map(
      submission({ submission_decks: [{ id: 'd', leader_id: 'OP13-001', place: 0 }] }),
      archive
    );
    assert.equal(decks[0].placing, 0);
  });
});

describe('missing values are named', () => {
  it('replaces a placeholder player rather than listing it', () => {
    for (const player of ['NA', 'n/a', 'unknown', 'none', '  ', null]) {
      const decks = map(
        submission({ submission_decks: [{ id: 'd', leader_id: 'OP13-001', player }] }),
        archive
      );
      assert.equal(decks[0].player, 'Not recorded', `player: ${String(player)}`);
    }
  });

  it('keeps a real name exactly as it was written', () => {
    assert.equal(map(submission(), archive)[0].player, 'Marta Bevilacqua');
    assert.equal(named('Nana', 'x'), 'Nana', 'a name containing "na" is still a name');
  });

  it('names an unnamed event', () => {
    assert.equal(map(submission({ event_name: '   ' }), archive)[0].eventName, 'Event not recorded');
  });

  it('falls back to unknown for a venue or tier the form did not carry', () => {
    const deck = map(submission({ venue: null, tier: '' }), archive)[0];
    assert.equal(deck.venue, 'unknown');
    assert.equal(deck.tier, 'local');
  });
});

describe('identity and shape', () => {
  it('gives a deck the same id every time it is ingested', () => {
    const once = map(submission(), archive)[0].id;
    const again = map(submission(), archive)[0].id;
    assert.equal(once, again);
    assert.equal(once, 'c-sub-1-deck-1');
  });

  it('groups every deck under one tournament id', () => {
    const decks = map(
      submission({
        submission_decks: [
          { id: 'a', leader_id: 'OP13-001' },
          { id: 'b', leader_id: 'OP13-001' },
        ],
      }),
      archive
    );
    assert.equal(new Set(decks.map((d) => d.tournamentId)).size, 1);
  });

  it('resolves a Leader it knows and keeps the number for one it does not', () => {
    const known = map(submission(), archive)[0];
    assert.equal(known.leaderName, 'Monkey.D.Luffy');
    assert.deepEqual(known.colors, ['Red', 'Green']);

    const unknown = map(
      submission({ submission_decks: [{ id: 'd', leader_id: 'ZZ99-999' }] }),
      archive
    )[0];
    assert.equal(unknown.leaderName, 'ZZ99-999');
    assert.deepEqual(unknown.colors, []);
  });

  it('reads a timestamp down to the day', () => {
    assert.equal(map(submission({ event_date: '2026-08-24T00:00:00+00:00' }), archive)[0].date, '2026-08-24');
  });

  it('marks every row as community, whatever else it says', () => {
    assert.equal(map(submission({ source: 'limitless' }), archive)[0].source, 'community');
  });

  it('carries a Japanese submission as JP and anything else as EN', () => {
    assert.equal(map(submission({ region: 'JP' }), archive)[0].region, 'JP');
    assert.equal(map(submission({ region: 'jp' }), archive)[0].region, 'EN');
  });

  /*
   * Who ran it, which is the one thing this source can say and the two automated
   * ones cannot. The event page prints it, so a placeholder reaching the corpus
   * would be published as somebody's name.
   */
  it('carries the organizer through, and names a missing one as null', () => {
    assert.equal(map(submission({ organizer: 'Rialto TO' }), archive)[0].organizer, 'Rialto TO');
    assert.equal(map(submission({ organizer: null }), archive)[0].organizer, null);
    assert.equal(map(submission({ organizer: '  ' }), archive)[0].organizer, null);
    assert.equal(map(submission({ organizer: 'unknown' }), archive)[0].organizer, null);
  });
});

describe('the fixture the ingest is exercised with', () => {
  it('maps as the mapping says it does', async () => {
    const file = path.join(import.meta.dirname, 'fixtures', 'submissions.json');
    const rows = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>[];
    const approved = rows.filter((r) => r.status === 'approved');
    assert.equal(approved.length, 2, 'the fixture should carry one unapproved row');

    const decks = approved.flatMap((r) => map(r, archive));
    assert.equal(decks.length, 3);
    assert.equal(decks.filter((d) => d.sampling === 'field').length, 2);
    assert.equal(decks.filter((d) => d.sampling === 'winners').length, 1);
    assert.ok(
      decks.every((d) => d.source === 'community'),
      'every submitted deck belongs to the community corpus'
    );
    /* The row whose player is "NA" — the most common non-name in the raw data. */
    assert.equal(decks.filter((d) => d.player === 'Not recorded').length, 2);
  });
});
