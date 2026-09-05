'use client';

import { useEffect, useMemo, useState } from 'react';
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
  withTrend,
  type MetaIndex,
} from '@/lib/meta';
import { Trend, WindowBar, WinRate, useMetaIndex, useWindow } from './useMeta';

/** A deck this rare in the chosen window is a one-off, not a metagame position. */
const MIN_DECKS = 3;

/**
 * How many archetypes the table opens with.
 *
 * A window holds up to 141 of them and the tail is decks somebody brought once.
 * Ten is what the question "what is being played" is actually answered by, and
 * the rest are one click away rather than four screens of scrolling away.
 */
const HEAD = 10;

/** The winners are a list to glance at, not a table to read through. */
const RECENT = 12;

export default function MetaBrowser() {
  const { window: window_, setWindow, venues, setVenues, tiers, setTiers, region, setRegion } = useWindow();
  const { index, error, loadingArchive } = useMetaIndex(region, window_);
  const [all, setAll] = useState(false);

  /*
   * Every control above the table changes what the top ten *are*, so an expanded
   * table would silently become a different question's long tail. It closes again.
   */
  useEffect(() => setAll(false), [region, window_, venues, tiers]);

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

      {/*
        Conditional, and therefore still here rather than on /data with the rest of
        the caveats: it explains the table in front of you right now — why a column
        is missing, or which decks the one you can see was counted from. A line, not
        a box; the reasoning is one link away.
      */}
      {!fieldSample ? (
        <p className="muted source-line" style={{ marginBottom: '1.1rem' }}>
          These are decks that placed, not whole fields, so the column reads{' '}
          <em>share of wins</em> and no win rate is shown —{' '}
          <Link href="/data" className="inline-link">
            why
          </Link>
          .
        </p>
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
              {(all ? rows : rows.slice(0, HEAD)).map((a, i) => (
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

      {rows.length > HEAD ? (
        <p style={{ marginTop: '1rem' }}>
          <button type="button" className="chip" onClick={() => setAll(!all)}>
            {all
              ? `Show only the top ${HEAD}`
              : `Show the other ${(rows.length - HEAD).toLocaleString('en-US')} archetypes`}
          </button>
        </p>
      ) : null}

      <RecentWinners index={index} decks={decks} />
    </>
  );
}



/**
 * The most recent events somebody won, in this window.
 *
 * It listed top-eight finishes until it did not: eight rows of one Regional is a
 * standings page rather than a look at the metagame, and the only thing separating
 * those rows is the column saying which of the eight each was. A win is the result
 * the table above is built from — the Wins column is these — so this is that
 * column opened up, and the placing column went with the change, since every row
 * in it now reads 1st.
 */
function RecentWinners({ index, decks }: { index: MetaIndex; decks: MetaDeck[] }) {
  const results = useMemo(
    () =>
      decks
        .filter((d) => d.p === 1)
        /* Newest first, and the larger field first within a day. */
        .sort((a, b) => b.d.localeCompare(a.d) || (b.n ?? 0) - (a.n ?? 0))
        .slice(0, RECENT),
    [decks]
  );

  if (results.length === 0) return null;

  return (
    <>
      <div className="section-head" style={{ marginTop: '2.75rem' }}>
        <h2 className="display">Latest winners</h2>
        <span className="muted" style={{ fontSize: '0.78rem' }}>
          the {results.length} most recent wins in this window
        </span>
      </div>
      <div className="table-scroll">
        <table className="meta-table">
          <thead>
            <tr>
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

