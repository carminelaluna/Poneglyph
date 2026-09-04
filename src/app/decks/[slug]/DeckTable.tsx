'use client';

import Link from 'next/link';
import EventLink from '../EventLink';
import PlayerLink from '../PlayerLink';
import { formatRecord, ordinal, type MetaDeck } from '@/lib/meta';

/**
 * The registered lists for one archetype, as a table.
 *
 * It lives here rather than inline because it now has two callers — the archetype
 * page, which draws ten of them, and the decklists page, which draws all of them
 * with the ordering controls. Two copies would be two answers to what a row of this
 * archive looks like, and the one that drifted would be the one nobody was reading.
 *
 * Ordering is the caller's business: the archetype page has one order and no
 * control for it, the full page has three.
 */
export default function DeckTable({ decks }: { decks: MetaDeck[] }) {
  return (
    <div className="table-scroll">
      <table className="meta-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'right' }}>Place</th>
            <th style={{ textAlign: 'right' }}>Record</th>
            <th>Player</th>
            <th>Tournament</th>
            <th style={{ textAlign: 'right' }}>Players</th>
            <th style={{ textAlign: 'right' }}>Date</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {decks.map((deck) => (
            <tr key={deck.i}>
              <td className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {deck.p === null ? (
                  <span className="muted">—</span>
                ) : deck.p === 1 ? (
                  <b style={{ color: 'var(--rune-lit)' }}>{ordinal(deck.p)}</b>
                ) : (
                  ordinal(deck.p)
                )}
              </td>
              <td className="mono" style={{ textAlign: 'right' }}>
                {deck.w + deck.s === 0 ? (
                  <span className="muted">—</span>
                ) : (
                  formatRecord(deck.w, deck.s, deck.t)
                )}
              </td>
              <td>
                <PlayerLink name={deck.a} />
              </td>
              <td style={{ maxWidth: '26ch' }}>
                <EventLink name={deck.e} eventId={deck.x} />
              </td>
              <td className="mono muted" style={{ textAlign: 'right' }}>
                {deck.n || '—'}
              </td>
              <td className="mono muted" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {deck.d}
              </td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <Link href={`/deck/${deck.i}`} className="muted" style={{ fontSize: '0.78rem' }}>
                  View →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
