'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { art } from '@/lib/art';
import {
  DECK_SIZE,
  MAX_COPIES,
  type DeckCard,
  colorsMatch,
  parseDeckList,
} from '@/lib/deck-rules';
import { dataUrl } from '@/lib/paths';
import { accountsEnabled, supabase } from '@/lib/supabase';
import {
  listSubmissions,
  useAccount,
  withdrawSubmission,
  type Submission,
} from '@/lib/useAccount';

/**
 * Submitting a tournament.
 *
 * The design decision that matters is that decklists are **pasted, not built**. An
 * organizer with a thirty-two player event is not going to click fifty cards
 * thirty-two times, and they already have the lists in the format OPTCGSim reads —
 * which is the format this site exports. `parseDeckList` is the inverse of that
 * export, so a list that came out of here goes back in unchanged.
 *
 * Everything is checked in the page and nothing is enforced by it. A deck that is
 * 49 cards, or names a card the archive has not ingested yet, is still submittable:
 * the review step is the gate, and a form that refuses a real result because our
 * data is behind would be the wrong kind of strict.
 */

type Row = { i: string; n: string; c: string[]; y: string; f: 0 | 1 };

type DeckEntry = {
  key: number;
  player: string;
  place: string;
  wins: string;
  losses: string;
  ties: string;
  list: string;
};

const TIERS = [
  ['local', 'Local'],
  ['store', 'Store / shop event'],
  ['regional', 'Regional'],
  ['treasure', 'Treasure Cup'],
  ['championship', 'Championship'],
  ['qualifier', 'Qualifier'],
  ['finals', 'Finals'],
  ['worlds', 'Worlds'],
] as const;

const VENUES = [
  ['offline', 'In person'],
  ['simulator', 'Simulator'],
  ['webcam', 'Webcam'],
] as const;

const blankDeck = (key: number): DeckEntry => ({
  key,
  player: '',
  place: '',
  wins: '',
  losses: '',
  ties: '',
  list: '',
});

const TIER_LABEL = new Map<string, string>(TIERS.map(([id, label]) => [id, label]));

const day = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * What you have sent, and what happened to it.
 *
 * This form used to be write-only. You submitted a tournament, saw one confirmation
 * screen, and the site never mentioned it again — so "approved, rejected, or did I
 * misclick" had no answer anywhere on it. The policy to read your own submissions
 * was in the first schema; nothing had ever called it.
 *
 * A rejection carries a note, and the note is the point: "the fourth list is 49
 * cards" is something the organizer can fix and send again.
 */
function SubmissionHistory({ reloadKey }: { reloadKey: number }) {
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    listSubmissions()
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load.'));
  }, []);

  useEffect(load, [load, reloadKey]);

  const withdraw = async (id: string) => {
    setBusy(id);
    try {
      await withdrawSubmission(id);
      setRows((held) => (held ?? []).filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not withdraw it.');
    } finally {
      setBusy(null);
    }
  };

  if (rows === null && !error) return null;

  return (
    <section className="submit-block">
      <div className="section-head">
        <h2 className="display">Your submissions</h2>
        <span className="muted" style={{ fontSize: '0.78rem' }}>
          {rows?.length ? `${rows.length} sent` : null}
        </span>
      </div>

      {error ? <p className="build-error">{error}</p> : null}

      {rows && rows.length === 0 ? (
        <p className="empty">Nothing sent yet.</p>
      ) : (
        <ul className="sub-list">
          {(rows ?? []).map((row) => (
            <li key={row.id} className="sub-row slab">
              <div className="sub-head">
                <b>{row.event_name}</b>
                <span className={`sub-status sub-${row.status}`}>{row.status}</span>
              </div>
              <p className="sub-meta">
                {day(row.event_date)} · {TIER_LABEL.get(row.tier) ?? row.tier} ·{' '}
                {row.region === 'JP' ? 'Japanese' : 'English'} ·{' '}
                {row.submission_decks?.[0]?.count ?? 0} decks ·{' '}
                {row.sampling === 'field' ? 'whole field' : 'winners only'}
              </p>
              {row.review_note ? <p className="sub-note">{row.review_note}</p> : null}
              {row.status === 'pending' ? (
                <p className="sub-actions">
                  <span className="muted">Waiting for review.</span>
                  <button
                    type="button"
                    className="account-link"
                    disabled={busy === row.id}
                    onClick={() => withdraw(row.id)}
                  >
                    {busy === row.id ? 'Withdrawing…' : 'Withdraw'}
                  </button>
                </p>
              ) : null}
              {row.status === 'approved' ? (
                <p className="sub-actions">
                  <span className="muted">
                    In the corpus from the next ingest — see the{' '}
                    <Link href="/decks">metagame page</Link>.
                  </span>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function SubmitForm() {
  const { checked, signedIn, isOrganizer, userId } = useAccount();
  const [rows, setRows] = useState<Row[] | null>(null);

  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [venue, setVenue] = useState<string>('offline');
  const [tier, setTier] = useState<string>('local');
  const [region, setRegion] = useState<'EN' | 'JP'>('EN');
  const [sampling, setSampling] = useState<'field' | 'winners' | ''>('');
  const [players, setPlayers] = useState('');

  const [decks, setDecks] = useState<DeckEntry[]>([blankDeck(1)]);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);
  /* Bumped after a send, so the history below re-reads rather than going stale. */
  const [sentCount, setSentCount] = useState(0);

  useEffect(() => {
    if (!accountsEnabled) return;
    fetch(dataUrl('cards-index.json'))
      .then((r) => r.json())
      .then((data) => setRows(data as Row[]))
      .catch(() => setRows([]));
  }, []);

  const byId = useMemo(() => {
    const map = new Map<string, Row>();
    for (const row of rows ?? []) map.set(row.i, row);
    return map;
  }, [rows]);

  /** One pasted list, read back as a Leader plus counted cards, with any problems. */
  const readDeck = useCallback(
    (entry: DeckEntry) => {
      const parsed = parseDeckList(entry.list);
      const known = parsed.map((c) => ({ ...c, row: byId.get(c.id) }));

      const leaderEntry = known.find((c) => c.row?.y === 'Leader');
      const cards = known.filter((c) => c !== leaderEntry);
      const total = cards.reduce((n, c) => n + c.count, 0);

      const problems: string[] = [];
      if (parsed.length === 0) {
        return { leader: null, cards, total, problems, empty: true };
      }
      if (!leaderEntry) problems.push('No Leader found in the list.');
      if (total !== DECK_SIZE) problems.push(`${total} cards, not ${DECK_SIZE}.`);

      const over = cards.filter((c) => c.count > MAX_COPIES);
      if (over.length) problems.push(`Over ${MAX_COPIES} copies: ${over.map((c) => c.id).join(', ')}.`);

      const unknown = known.filter((c) => !c.row);
      if (unknown.length) {
        problems.push(`Not in the archive yet: ${unknown.map((c) => c.id).join(', ')}.`);
      }

      if (leaderEntry?.row) {
        const leader = { ...toCard(leaderEntry.row), life: null };
        const offColour = cards.filter(
          (c) => c.row && !colorsMatch(leader, toCard(c.row))
        );
        if (offColour.length) {
          problems.push(
            `Not the Leader's colours: ${offColour.map((c) => c.id).join(', ')} — check the Leader's text.`
          );
        }
      }

      return { leader: leaderEntry?.row ?? null, cards, total, problems, empty: false };
    },
    [byId]
  );

  const readings = useMemo(() => decks.map(readDeck), [decks, readDeck]);

  const update = (key: number, patch: Partial<DeckEntry>) =>
    setDecks((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const ready =
    eventName.trim() !== '' &&
    eventDate !== '' &&
    sampling !== '' &&
    decks.some((d, i) => d.list.trim() !== '' && readings[i].leader);

  const submit = useCallback(async () => {
    const client = supabase();
    if (!client || !userId) return;
    setState('sending');
    setError(null);

    try {
      const { data: created, error: subError } = await client
        .from('submissions')
        .insert({
          organizer_id: userId,
          event_name: eventName.trim(),
          event_date: eventDate,
          venue,
          tier,
          region,
          sampling,
          /* Null, not zero — "not recorded" is not "nobody came". */
          players: players.trim() === '' ? null : Number(players),
        })
        .select('id')
        .single();
      if (subError) throw new Error(subError.message);

      const submissionId = (created as { id: string }).id;
      const payload = decks
        .map((entry, i) => ({ entry, reading: readings[i] }))
        .filter(({ reading }) => !reading.empty && reading.leader)
        .map(({ entry, reading }) => ({
          submission_id: submissionId,
          player: entry.player.trim() || null,
          /* The column is `place`; PLACING is reserved in Postgres. */
          place: entry.place.trim() === '' ? null : Number(entry.place),
          wins: Number(entry.wins || 0),
          losses: Number(entry.losses || 0),
          ties: Number(entry.ties || 0),
          leader_id: reading.leader!.i,
          cards: reading.cards.map((c) => ({ id: c.id, count: c.count })),
        }));

      const { error: deckError } = await client.from('submission_decks').insert(payload);
      if (deckError) throw new Error(deckError.message);

      setSentCount((n) => n + 1);
      setState('sent');
    } catch (err) {
      setState('failed');
      setError(err instanceof Error ? err.message : 'Could not submit.');
    }
  }, [userId, eventName, eventDate, venue, tier, region, sampling, players, decks, readings]);

  /* ------------------------------------------------------------- gates */

  if (!accountsEnabled) {
    return <p className="empty">Accounts are not set up on this deployment.</p>;
  }
  if (!checked) return <p className="muted">Checking…</p>;
  if (!signedIn) {
    return (
      <p className="empty">
        <Link href="/account">Sign in</Link> to submit results.
      </p>
    );
  }
  if (!isOrganizer) {
    return (
      <p className="empty">
        Submitting tournaments needs the organizer role.{' '}
        <Link href="/account">Ask for it on your account page</Link> — it is granted by a
        person reading what you run, not automatically.
      </p>
    );
  }
  if (state === 'sent') {
    return (
      <div className="submit">
        <div className="slab slab-pad">
          <h2 className="display" style={{ margin: 0, fontSize: '1.2rem' }}>
            Submitted for review
          </h2>
          <p className="muted" style={{ marginTop: '0.6rem', maxWidth: '60ch' }}>
            It joins the metagame figures once it has been looked at. Nothing appears on the
            site before then — that review is what keeps the numbers worth reading.
          </p>
          <p style={{ marginTop: '1.2rem' }}>
            <button
              type="button"
              className="chip"
              onClick={() => globalThis.location.reload()}
            >
              Submit another
            </button>
          </p>
        </div>
        <SubmissionHistory reloadKey={sentCount} />
      </div>
    );
  }

  /* -------------------------------------------------------------- form */

  return (
    <div className="submit">
      <section className="submit-block slab slab-pad">
        <h2 className="display">The event</h2>
        <div className="submit-grid">
          <label>
            <span className="eyebrow">Name</span>
            <input
              className="control"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="Spring Regional, Milan"
              maxLength={120}
            />
          </label>
          <label>
            <span className="eyebrow">Date</span>
            <input
              className="control"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </label>
          <label>
            <span className="eyebrow">Played</span>
            <select className="control" value={venue} onChange={(e) => setVenue(e.target.value)}>
              {VENUES.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="eyebrow">Kind</span>
            <select className="control" value={tier} onChange={(e) => setTier(e.target.value)}>
              {TIERS.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="eyebrow">Card pool</span>
            <select
              className="control"
              value={region}
              onChange={(e) => setRegion(e.target.value as 'EN' | 'JP')}
            >
              <option value="EN">English</option>
              <option value="JP">Japanese</option>
            </select>
          </label>
          <label>
            <span className="eyebrow">Entrants</span>
            <input
              className="control"
              type="number"
              min="0"
              value={players}
              onChange={(e) => setPlayers(e.target.value)}
              placeholder="Leave blank if unknown"
            />
          </label>
        </div>

        {/*
          The one question on this form that changes what the numbers mean, so it is
          asked outright with the consequence spelled out rather than buried in a
          dropdown labelled "sampling".
        */}
        <fieldset className="submit-sampling">
          <legend className="eyebrow">What are you uploading?</legend>
          <label>
            <input
              type="radio"
              name="sampling"
              checked={sampling === 'field'}
              onChange={() => setSampling('field')}
            />
            <span>
              <b>Every deck in the event</b>
              <span className="muted"> — counts towards win rates.</span>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="sampling"
              checked={sampling === 'winners'}
              onChange={() => setSampling('winners')}
            />
            <span>
              <b>Only the decks that placed</b>
              <span className="muted"> — counts towards share, but not win rate.</span>
            </span>
          </label>
          <p className="muted submit-note">
            A top cut counted as a whole field produces a win rate near 100%, which is worse
            than no number at all. If you are unsure, choose the second.
          </p>
        </fieldset>
      </section>

      <section className="submit-block">
        <div className="section-head">
          <h2 className="display">The decks</h2>
          <span className="muted" style={{ fontSize: '0.78rem' }}>
            Paste each list in the format the simulator reads
          </span>
        </div>

        {decks.map((entry, i) => {
          const reading = readings[i];
          return (
            <div key={entry.key} className="submit-deck slab slab-pad">
              <div className="submit-deck-head">
                <input
                  className="control"
                  placeholder="Player"
                  value={entry.player}
                  onChange={(e) => update(entry.key, { player: e.target.value })}
                  maxLength={80}
                />
                <input
                  className="control submit-narrow"
                  type="number"
                  min="1"
                  placeholder="Place"
                  value={entry.place}
                  onChange={(e) => update(entry.key, { place: e.target.value })}
                />
                <span className="submit-record">
                  {(['wins', 'losses', 'ties'] as const).map((field) => (
                    <input
                      key={field}
                      className="control submit-narrow"
                      type="number"
                      min="0"
                      placeholder={field[0].toUpperCase()}
                      value={entry[field]}
                      onChange={(e) => update(entry.key, { [field]: e.target.value })}
                      aria-label={field}
                    />
                  ))}
                </span>
                {decks.length > 1 ? (
                  <button
                    type="button"
                    className="account-link"
                    onClick={() => setDecks((prev) => prev.filter((d) => d.key !== entry.key))}
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <textarea
                className="control submit-list"
                rows={5}
                placeholder={'1xOP01-001\n4xOP01-025\n…'}
                value={entry.list}
                onChange={(e) => update(entry.key, { list: e.target.value })}
              />

              {reading.empty ? null : (
                <div className="submit-reading">
                  {reading.leader ? (
                    <span className="submit-leader">
                      <img src={art(reading.leader.i, 96)} alt="" loading="lazy" />
                      {reading.leader.n}
                    </span>
                  ) : null}
                  <span className={reading.total === DECK_SIZE ? 'submit-ok' : 'muted'}>
                    {reading.total}/{DECK_SIZE}
                  </span>
                  {reading.problems.map((p) => (
                    <span key={p} className="submit-problem">{p}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          className="chip"
          onClick={() => setDecks((prev) => [...prev, blankDeck(Date.now())])}
        >
          Add another deck
        </button>
      </section>

      <div className="submit-send">
        <button
          type="button"
          className="chip submit-button"
          disabled={!ready || state === 'sending'}
          onClick={submit}
        >
          {state === 'sending' ? 'Submitting…' : 'Submit for review'}
        </button>
        {!ready ? (
          <span className="muted">
            Needs a name, a date, an answer above, and at least one list with a Leader.
          </span>
        ) : null}
        {error ? <p className="build-error">{error}</p> : null}
      </div>

      <SubmissionHistory reloadKey={sentCount} />
    </div>
  );
}

const toCard = (row: Row): DeckCard => ({
  id: row.i,
  name: row.n,
  colors: row.c,
  category: row.y,
  standard: row.f,
});
