'use client';

import { useMemo } from 'react';
import { art } from '@/lib/art';
import Link from 'next/link';
import EventLink from './EventLink';
import PlayerLink from './PlayerLink';
import { pigment } from '@/lib/colors';
import {
  aggregate,
  filterDecks,
  type MetaDeck,
  formatRecord,
  ordinal,
  withTrend,
  type MetaIndex,
} from '@/lib/meta';
import { Trend, WindowBar, WinRate, useMetaIndex, useWindow } from './useMeta';

/** A deck this rare in the chosen window is a one-off, not a metagame position. */
const MIN_DECKS = 3;

export default function MetaBrowser() {
  const { window: window_, setWindow, venues, setVenues, tiers, setTiers, region, setRegion } = useWindow();
  const { index, error, loadingArchive } = useMetaIndex(region, window_);

  const view = useMemo(() => {
    if (!index) return null;
    const decks = filterDecks(index, window_, venues, tiers);
    const rows = withTrend(aggregate(decks, index), index, window_, venues, tiers).filter(
      (a) => a.decks >= MIN_DECKS
    );
    return { decks, rows };
  }, [index, window_, venues, tiers]);

  if (error) {
    return (
      <p className="empty">
        The deck index did not load ({error}). Run <code className="mono">npm run ingest:decks</code>{' '}
        to build it.
      </p>
    );
  }

  if (!index || !view) return <p className="empty">Reading tournament results…</p>;

  const { decks, rows } = view;
  const top = rows[0]?.share ?? 1;
  /* Win rate needs whole-field results; a corpus of decks that placed has none. */
  const fieldSample = (index.fieldDecks ?? 0) > 0;

  return (
    <>
      <WindowBar
        window={window_}
        onChange={setWindow}
        venues={venues}
        onVenues={setVenues}
        tiers={tiers}
        onTiers={setTiers}
        region={region}
        onRegion={setRegion}
        index={index}
        count={decks.length}
      />

      {!fieldSample ? (
        <div className="notice" style={{ marginTop: 0, marginBottom: '1.25rem' }}>
          <p style={{ margin: 0 }}>
            <strong>These are decks that placed, not whole fields.</strong> Three in four are
            first-place lists, so <em>share of wins</em> answers what is winning. A win rate from
            that sample would read near 100% and describe the sample rather than the deck, so it
            is not shown.
          </p>
        </div>
      ) : index.sampling === 'mixed' ? (
        <div className="notice" style={{ marginTop: 0, marginBottom: '1.25rem' }}>
          <p style={{ margin: 0 }}>
            <strong>Mixed sources.</strong> Share counts every recorded deck; win rate counts only
            the {index.fieldDecks?.toLocaleString('en-US')} from whole tournament fields, because
            the rest are decks that placed. Each row shows the sample its win rate came from.
          </p>
        </div>
      ) : null}

      {loadingArchive ? (
        <p className="empty" style={{ padding: '1rem' }}>
          Loading the older results for this window…
        </p>
      ) : null}

      {decks.length === 0 ? (
        <div className="empty">
          <p>No tournament results in this window.</p>
          <button type="button" className="link-btn" onClick={() => setWindow({ kind: 'all' })}>
            Show all recorded results
          </button>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="meta-table">
            <thead>
              <tr>
                <th />
                <th>Leader</th>
                <th>{fieldSample ? 'Share of field' : 'Share of wins'}</th>
                <th style={{ textAlign: 'right' }}>Trend</th>
                <th style={{ textAlign: 'right' }}>Decks</th>
                {fieldSample ? <th style={{ textAlign: 'right' }}>Win rate</th> : null}
                <th style={{ textAlign: 'right' }}>Top 8</th>
                <th style={{ textAlign: 'right' }}>Wins</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => (
                <tr key={a.leaderId}>
                  <td className="meta-rank">{i + 1}</td>
                  <td>
                    <Link href={`/decks/${a.slug}`} className="meta-leader">
                      <img src={art(a.leaderId, 96)} alt="" loading={i < 12 ? 'eager' : 'lazy'} />
                      <span style={{ minWidth: 0 }}>
                        <span className="meta-leader-name" style={{ display: 'block' }}>
                          {a.name}
                        </span>
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            marginTop: '2px',
                          }}
                        >
                          <span className="pips">
                            {a.colors.map((c) => (
                              <i
                                key={c}
                                className="pip"
                                style={{ '--pip': pigment(c) } as React.CSSProperties}
                              />
                            ))}
                          </span>
                          <span className="meta-leader-id">
                            {a.colors.join('/')} · {a.leaderId}
                          </span>
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <div
                      className="share-bar"
                      style={
                        {
                          '--share': `${Math.min(100, (a.share / top) * 100)}%`,
                          '--pigment': pigment(a.colors[0] ?? ''),
                        } as React.CSSProperties
                      }
                    >
                      <i />
                      <span>{a.share.toFixed(2)}%</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Trend delta={a.delta} />
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {a.decks}
                  </td>
                  {fieldSample ? (
                    <td style={{ textAlign: 'right' }}>
                      <WinRate value={a.winRate} sample={a.winRateSample} />
                    </td>
                  ) : null}
                  <td className="mono muted" style={{ textAlign: 'right' }}>
                    {a.top8 || '—'}
                  </td>
                  <td className="mono muted" style={{ textAlign: 'right' }}>
                    {a.firsts || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RecentResults index={index} decks={decks} />
    </>
  );
}



function RecentResults({ index, decks }: { index: MetaIndex; decks: MetaDeck[] }) {
  const results = useMemo(
    () =>
      decks
        .filter((d) => d.p !== null && d.p <= 8)
        .sort((a, b) => b.d.localeCompare(a.d) || (a.p ?? 999) - (b.p ?? 999))
        .slice(0, 12),
    [decks]
  );

  if (results.length === 0) return null;

  return (
    <>
      <div className="section-head" style={{ marginTop: '2.75rem' }}>
        <h2 className="display">Top 8 finishes in this window</h2>
      </div>
      <div className="table-scroll">
        <table className="meta-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'right' }}>Place</th>
              <th>Deck</th>
              <th style={{ textAlign: 'right' }}>Record</th>
              <th>Player</th>
              <th>Tournament</th>
              <th style={{ textAlign: 'right' }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {results.map((deck) => {
              const leader = index.leaders[deck.l];
              return (
                <tr key={deck.i}>
                  <td className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {deck.p === 1 ? (
                      <b style={{ color: 'var(--rune-lit)' }}>{ordinal(deck.p)}</b>
                    ) : (
                      ordinal(deck.p!)
                    )}
                  </td>
                  <td>
                    <Link href={`/deck/${deck.i}`} className="meta-leader">
                      <img src={art(deck.l, 96)} alt="" loading="lazy" />
                      <span style={{ minWidth: 0 }}>
                        <span className="meta-leader-name" style={{ display: 'block' }}>
                          {leader?.n ?? deck.l}
                        </span>
                        <span className="meta-leader-id">
                          {(leader?.c ?? []).join('/')} · {deck.l}
                        </span>
                      </span>
                    </Link>
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
                  <td className="mono muted" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {deck.d}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
