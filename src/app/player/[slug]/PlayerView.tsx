'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Pips from '@/components/Pips';
import { art } from '@/lib/art';
import { pigment } from '@/lib/colors';
import { formatRecord, ordinal } from '@/lib/meta';
import { getPlayer, loadLeaders, type Leaders, type ShardPlayer } from '@/lib/shards';

/**
 * One competitor's record, drawn in the browser.
 *
 * 8,679 named players are on record and only the regulars are prerendered, so this
 * fetches its own bucket — see lib/shards.ts.
 */
export default function PlayerView({ slug }: { slug: string }) {
  const [player, setPlayer] = useState<ShardPlayer | null>(null);
  const [leaders, setLeaders] = useState<Leaders>({});
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    Promise.all([getPlayer(slug), loadLeaders()])
      .then(([found, table]) => {
        if (cancelled) return;
        setLeaders(table);
        if (!found) return setState('missing');
        setPlayer(found);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const name = (leaderId: string) => leaders[leaderId]?.n ?? leaderId;
  const colors = (leaderId: string) => leaders[leaderId]?.c ?? [];

  if (state === 'loading') {
    return (
      <div className="shell" style={{ paddingBlock: '2rem 3rem' }}>
        <p className="eyebrow">
          <Link href="/decks">Metagame</Link> · Player
        </p>
        <p className="muted" style={{ marginTop: '1.5rem' }}>
          Loading these results…
        </p>
      </div>
    );
  }

  if (state !== 'ready' || !player) {
    return (
      <div className="shell" style={{ paddingBlock: '2rem 3rem' }}>
        <p className="eyebrow">
          <Link href="/decks">Metagame</Link> · Player
        </p>
        <h1 className="display" style={{ fontSize: '1.6rem', margin: '0.6rem 0 0' }}>
          {state === 'missing' ? 'No results under that name' : 'Could not load these results'}
        </h1>
        <p className="muted" style={{ marginTop: '0.8rem', maxWidth: '62ch' }}>
          {state === 'missing'
            ? 'Nobody on record matches this name. Spellings are never merged — a handle written two ways is two entries here — so the results may be filed under a different one.'
            : 'The results file did not load. Check your connection and reload.'}
        </p>
        <p style={{ marginTop: '1.2rem' }}>
          <Link href="/decks">Back to the metagame →</Link>
        </p>
      </div>
    );
  }

  const best = player.results
    .filter((r) => r.p !== null)
    .sort((a, b) => (a.p ?? 999) - (b.p ?? 999))[0];

  return (
    <div className="shell" style={{ paddingBlock: '2rem 3rem' }}>
      <p className="eyebrow">
        <Link href="/decks">Metagame</Link> · Player
      </p>
      <h1
        className="display"
        style={{ fontSize: 'clamp(1.7rem, 3.6vw, 2.6rem)', margin: '0.4rem 0 0' }}
      >
        {player.name}
      </h1>

      {player.names.length > 1 ? (
        <p className="muted" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
          Also recorded as {player.names.slice(1).join(', ')}.
        </p>
      ) : null}

      <dl className="stats" style={{ marginTop: '1.35rem' }}>
        <div className="stat">
          <dt>Results</dt>
          <dd>{player.results.length}</dd>
        </div>
        <div className="stat">
          <dt>Events</dt>
          <dd>{player.events}</dd>
        </div>
        <div className="stat">
          <dt>Wins</dt>
          <dd className={player.wins ? undefined : 'none'}>{player.wins || '—'}</dd>
        </div>
        <div className="stat">
          <dt>Top 8</dt>
          <dd className={player.top8 ? undefined : 'none'}>{player.top8 || '—'}</dd>
        </div>
        <div className="stat">
          <dt>Best</dt>
          <dd className={`small${best?.p ? '' : ' none'}`}>
            {best?.p ? ordinal(best.p) : 'Not recorded'}
          </dd>
        </div>
        <div className="stat">
          <dt>Active</dt>
          <dd className="small">
            {player.first === player.last ? player.first : `${player.first} – ${player.last}`}
          </dd>
        </div>
      </dl>

      <p className="muted" style={{ fontSize: '0.76rem', marginTop: '0.9rem', maxWidth: '72ch' }}>
        Results are grouped by the name as each source reported it. A handle appearing in more
        than one source is treated as one player, which is usually right and is not verified —
        the source of every row is shown below.
      </p>

      {player.archetypes.length > 0 ? (
        <>
          <div className="section-head" style={{ marginTop: '2rem' }}>
            <h2 className="display">Decks played</h2>
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              {player.archetypes.length} archetype{player.archetypes.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="player-decks">
            {player.archetypes.map((a) => (
              <Link
                key={a.leaderId}
                href={`/decks/${a.leaderId.toLowerCase()}`}
                className="player-deck"
                style={{ '--pigment': pigment(colors(a.leaderId)[0] ?? '') } as React.CSSProperties}
              >
                <img src={art(a.leaderId, 96)} alt="" loading="lazy" />
                <span style={{ minWidth: 0 }}>
                  <b>{name(a.leaderId)}</b>
                  <span className="player-deck-meta">
                    <Pips colors={colors(a.leaderId)} />
                    {a.count} result{a.count === 1 ? '' : 's'}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      <div className="section-head" style={{ marginTop: '2.25rem' }}>
        <h2 className="display">Results</h2>
        <span className="muted" style={{ fontSize: '0.78rem' }}>
          Most recent first
        </span>
      </div>

      <div className="table-scroll">
        <table className="meta-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'right' }}>Place</th>
              <th style={{ textAlign: 'right' }}>Record</th>
              <th>Deck</th>
              <th>Event</th>
              <th style={{ textAlign: 'right' }}>Date</th>
              <th>Source</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {player.results.map((r) => (
              <tr key={r.i}>
                <td className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {r.p === null ? (
                    <span className="muted">—</span>
                  ) : r.p === 1 ? (
                    <b style={{ color: 'var(--rune-lit)' }}>{ordinal(r.p)}</b>
                  ) : (
                    ordinal(r.p)
                  )}
                </td>
                <td className="mono" style={{ textAlign: 'right' }}>
                  {r.w + r.s === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    formatRecord(r.w, r.s, r.t)
                  )}
                </td>
                <td>
                  <Link href={`/decks/${r.l.toLowerCase()}`} className="meta-leader">
                    <img src={art(r.l, 96)} alt="" loading="lazy" />
                    <span style={{ minWidth: 0 }}>
                      <span className="meta-leader-name" style={{ display: 'block' }}>
                        {name(r.l)}
                      </span>
                      <span className="meta-leader-id">{r.l}</span>
                    </span>
                  </Link>
                </td>
                <td style={{ maxWidth: '28ch' }}>
                  {r.x ? (
                    <Link href={`/event/${r.x}`} className="event-link">
                      {r.e}
                    </Link>
                  ) : (
                    <span className="muted">{r.e}</span>
                  )}
                </td>
                <td className="mono muted" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {r.d}
                </td>
                <td className="muted" style={{ fontSize: '0.76rem', whiteSpace: 'nowrap' }}>
                  {r.o ? 'Top Decks' : 'Limitless'}
                  {r.g === 'jp' ? ' · JP' : ''}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <Link href={`/deck/${r.i}`} className="muted" style={{ fontSize: '0.78rem' }}>
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
