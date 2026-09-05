'use client';

import Link from 'next/link';
import { useState } from 'react';
import DeckTable from '../DeckTable';
import { filterDecks } from '@/lib/meta';
import { IndexError, WindowBar, useMetaIndex, useWindow, windowHref } from '../../useMeta';

/**
 * Every recorded list for one archetype, ordered three ways.
 *
 * The archetype page draws ten, best finish first, and links here. That is what
 * moved: the ordering control and the growing limit used to sit on the archetype
 * page under a table sixty rows deep, between the cards that define the deck and
 * nothing at all. A reader who wants the oldest lists is asking a different
 * question from one reading the archetype, and this is where it gets asked.
 *
 * Both orders past the default exist for one reason: sorted by finish and capped,
 * a four-year window shows first places and nothing else, so every deck older than
 * the last N wins is unreachable however far back the window is set.
 */
const ORDERS = [
  ['finish', 'Best finish'],
  ['newest', 'Newest'],
  ['oldest', 'Oldest'],
] as const;

/** Rows drawn before the next click. Generous: this page exists to be long. */
const PAGE = 100;

export default function DecklistsView({ leaderId, slug }: { leaderId: string; slug: string }) {
  const { window: window_, setWindow, venues, tiers, region, bar, query } = useWindow();
  const { index, error } = useMetaIndex(region, window_);
  const [order, setOrder] = useState<'finish' | 'newest' | 'oldest'>('finish');
  const [limit, setLimit] = useState(PAGE);

  if (error) return <IndexError error={error} />;
  if (!index) return <p className="empty">Reading tournament results…</p>;

  const decks = filterDecks(index, window_, venues, tiers)
    .filter((d) => d.l === leaderId)
    .sort((a, b) => {
      if (order === 'newest') return b.d.localeCompare(a.d) || (a.p ?? 999) - (b.p ?? 999);
      if (order === 'oldest') return a.d.localeCompare(b.d) || (a.p ?? 999) - (b.p ?? 999);
      /* A deck with no recorded placing sorts last rather than first. */
      return (a.p ?? 999) - (b.p ?? 999) || b.d.localeCompare(a.d) || b.w - a.w;
    });

  /*
   * Read off the dates rather than off the ends of the list — those are only
   * oldest-to-newest while the sort happens to be by date, and printed straight
   * they came out backwards.
   */
  const days = decks.map((d) => d.d).sort();
  const span = days.length ? { from: days[0], to: days[days.length - 1] } : null;

  return (
    <>
      <WindowBar {...bar} index={index} count={decks.length} noun="decks of this archetype" />

      {decks.length === 0 ? (
        <div className="empty">
          <p>This archetype has no recorded results in the chosen window.</p>
          <button type="button" className="link-btn" onClick={() => setWindow({ kind: 'all' })}>
            Show all recorded results
          </button>
        </div>
      ) : (
        <>
          <div className="section-head" style={{ marginTop: '1.6rem' }}>
            <h2 className="display">Decklists</h2>
            <span className="chip-row">
              {ORDERS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className="chip"
                  aria-pressed={order === id}
                  onClick={() => {
                    setOrder(id);
                    setLimit(PAGE);
                  }}
                >
                  {label}
                </button>
              ))}
            </span>
          </div>

          <p className="muted source-line" style={{ marginTop: '0.2rem' }}>
            {Math.min(limit, decks.length).toLocaleString('en-US')} of{' '}
            {decks.length.toLocaleString('en-US')} in this window
            {span ? (
              <>
                {' '}
                · {span.from} to {span.to}
              </>
            ) : null}
          </p>

          <DeckTable decks={decks.slice(0, limit)} />

          {decks.length > limit ? (
            <p style={{ marginTop: '1rem' }}>
              <button type="button" className="chip" onClick={() => setLimit(limit + 200)}>
                Show more
              </button>
            </p>
          ) : null}
        </>
      )}

      <p style={{ marginTop: '1.6rem' }}>
        <Link href={windowHref(`/decks/${slug}`, query)} className="chip">
          ← Back to the archetype
        </Link>
      </p>
    </>
  );
}
