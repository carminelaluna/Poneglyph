'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { art } from '@/lib/art';
import { DECK_SIZE, MAX_COPIES } from '@/lib/deck-rules';
import { loadCardNames, loadLeaders, type CardNames, type Leaders } from '@/lib/shards';
import { accountsEnabled } from '@/lib/supabase';
import {
  listForReview,
  reviewSubmission,
  submittedDecks,
  useAccount,
  type Submission,
  type SubmissionStatus,
  type SubmittedDeck,
} from '@/lib/useAccount';

/**
 * The review queue.
 *
 * Approving a submission used to mean opening the Supabase table editor and
 * changing a `status` cell by hand — workable for the first few, and awkward
 * immediately after, because the decklists live in a JSON column and the one thing
 * a reviewer has to actually look at is the thing that view shows worst.
 *
 * The gate has not moved. The role is still granted by hand in the dashboard and
 * still cannot be set from any client; the policies decide which rows come back
 * from the same query everyone else runs. This page only puts the work where the
 * data is readable.
 *
 * Card names come from `card-names.json` (19 KB), not the 176 KB card index: what
 * matters here is whether the list is fifty cards and whether the counts are legal,
 * and both are arithmetic on what was submitted.
 */

const TABS: { id: SubmissionStatus | 'all'; label: string }[] = [
  { id: 'pending', label: 'Waiting' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];

const day = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** What is wrong with one submitted list, in the reviewer's terms. */
function problemsWith(deck: SubmittedDeck): string[] {
  const problems: string[] = [];
  const total = deck.cards.reduce((n, c) => n + (c.count ?? 0), 0);
  if (total !== DECK_SIZE) problems.push(`${total} cards, not ${DECK_SIZE}`);
  const over = deck.cards.filter((c) => c.count > MAX_COPIES);
  if (over.length) problems.push(`over ${MAX_COPIES} copies: ${over.map((c) => c.id).join(', ')}`);
  return problems;
}

function Decks({ submissionId }: { submissionId: string }) {
  const [decks, setDecks] = useState<SubmittedDeck[] | null>(null);
  const [names, setNames] = useState<CardNames>({});
  const [leaders, setLeaders] = useState<Leaders>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([submittedDecks(submissionId), loadCardNames(), loadLeaders()])
      .then(([rows, cardNames, leaderNames]) => {
        if (cancelled) return;
        setDecks(rows);
        setNames(cardNames);
        setLeaders(leaderNames);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Failed.'));
    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  if (error) return <p className="build-error">{error}</p>;
  if (!decks) return <p className="muted">Reading the lists…</p>;
  if (decks.length === 0) return <p className="empty">This submission carries no decks.</p>;

  return (
    <ol className="review-decks">
      {decks.map((deck) => {
        const problems = problemsWith(deck);
        return (
          <li key={deck.id} className="review-deck">
            <div className="review-deck-head">
              <img src={art(deck.leader_id, 96)} alt="" loading="lazy" />
              <div style={{ minWidth: 0 }}>
                <b>{leaders[deck.leader_id]?.n ?? deck.leader_id}</b>
                <p className="sub-meta" style={{ marginTop: '0.1rem' }}>
                  {deck.player || 'Player not recorded'}
                  {deck.place ? ` · placed ${deck.place}` : ''} · {deck.wins}–{deck.losses}
                  {deck.ties ? `–${deck.ties}` : ''}
                </p>
              </div>
              {problems.length ? (
                <span className="submit-problem">{problems.join(' · ')}</span>
              ) : (
                <span className="submit-ok">{DECK_SIZE}/{DECK_SIZE}</span>
              )}
            </div>
            <ul className="review-cards">
              {deck.cards.map((card) => (
                <li key={card.id} className={card.count > MAX_COPIES ? 'review-over' : undefined}>
                  <span className="mono">{card.count}×</span> {names[card.id]?.[0] ?? card.id}{' '}
                  <span className="mono muted">{card.id}</span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

export default function ReviewQueue() {
  const { checked, signedIn, isAdmin } = useAccount();
  const [tab, setTab] = useState<SubmissionStatus | 'all'>('pending');
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!isAdmin) return;
    setRows(null);
    listForReview(tab)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load.'));
  }, [isAdmin, tab]);

  useEffect(load, [load]);

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    setBusy(id);
    setError(null);
    try {
      await reviewSubmission(id, status, notes[id] ?? '');
      /* Off the list when the list is one status; in place when it is all of them. */
      setRows((held) =>
        (held ?? [])
          .map((row) => (row.id === id ? { ...row, status, review_note: notes[id] ?? null } : row))
          .filter((row) => tab === 'all' || row.status === tab)
      );
      setOpen(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setBusy(null);
    }
  };

  /* ------------------------------------------------------------- gates */

  if (!accountsEnabled) {
    return <p className="empty">Accounts are not set up on this deployment.</p>;
  }
  if (!checked) return <p className="muted">Checking…</p>;
  if (!signedIn) {
    return (
      <p className="empty">
        <Link href="/account">Sign in</Link> to review submissions.
      </p>
    );
  }
  if (!isAdmin) {
    return (
      <p className="empty">
        Reviewing needs a role granted by hand in the database — the same gate that keeps
        anyone from adding a tournament to the metagame figures unreviewed.
      </p>
    );
  }

  /* ------------------------------------------------------------ queue */

  return (
    <div className="submit" style={{ marginTop: '1.2rem' }}>
      <div className="review-tabs">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="chip"
            aria-pressed={tab === entry.id}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {error ? <p className="build-error">{error}</p> : null}
      {rows === null ? <p className="muted">Loading…</p> : null}
      {rows && rows.length === 0 ? (
        <p className="empty">
          {tab === 'pending' ? 'Nothing waiting.' : 'Nothing here.'}
        </p>
      ) : null}

      <ul className="sub-list">
        {(rows ?? []).map((row) => (
          <li key={row.id} className="sub-row slab">
            <div className="sub-head">
              <b>{row.event_name}</b>
              <span className={`sub-status sub-${row.status}`}>{row.status}</span>
            </div>
            <p className="sub-meta">
              {day(row.event_date)} · {row.tier} · {row.region === 'JP' ? 'Japanese' : 'English'}{' '}
              · {row.submission_decks?.[0]?.count ?? 0} decks ·{' '}
              {row.players ? `${row.players} entrants` : 'entrants not recorded'}
              {' · '}
              {/*
                The field-versus-winners answer, spelled out rather than abbreviated.
                It is the organizer's claim about their own data and the one thing on
                this row a reviewer can only check by reading the decks.
              */}
              <b className={row.sampling === 'field' ? 'submit-ok' : undefined}>
                {row.sampling === 'field' ? 'whole field' : 'winners only'}
              </b>
            </p>

            <p className="sub-actions">
              <button
                type="button"
                className="account-link"
                onClick={() => setOpen(open === row.id ? null : row.id)}
              >
                {open === row.id ? 'Hide the decks' : 'Read the decks'}
              </button>
              {row.reviewed_at ? (
                <span className="muted">Reviewed {day(row.reviewed_at)}</span>
              ) : null}
            </p>

            {open === row.id ? <Decks submissionId={row.id} /> : null}

            {row.status === 'pending' ? (
              <div className="review-decide">
                <input
                  className="control"
                  placeholder="Note for the organizer — required to reject"
                  value={notes[row.id] ?? ''}
                  onChange={(e) => setNotes((held) => ({ ...held, [row.id]: e.target.value }))}
                  maxLength={300}
                />
                <button
                  type="button"
                  className="chip chip-link"
                  disabled={busy === row.id}
                  onClick={() => decide(row.id, 'approved')}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="chip"
                  disabled={busy === row.id || !(notes[row.id] ?? '').trim()}
                  onClick={() => decide(row.id, 'rejected')}
                  title={
                    (notes[row.id] ?? '').trim()
                      ? undefined
                      : 'Say why — the organizer sees this note and can fix it'
                  }
                >
                  Reject
                </button>
              </div>
            ) : row.review_note ? (
              <p className="sub-note">{row.review_note}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
