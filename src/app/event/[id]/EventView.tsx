'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Pips from '@/components/Pips';
import { art } from '@/lib/art';
import { pigment } from '@/lib/colors';
import { formatRecord, isNamedPlayer, ordinal, playerSlug } from '@/lib/meta';
import { getEvent, loadLeaders, type Leaders, type ShardEvent } from '@/lib/shards';

/**
 * One tournament, drawn in the browser.
 *
 * There are 7,150 events and only the largest few hundred are prerendered, so this
 * fetches its own slice — see lib/shards.ts for why. The shapes and the wording
 * match the build-time version deliberately: a prerendered event and a fetched one
 * are the same page.
 */

const VENUES: Record<string, string> = {
  simulator: 'Played on a simulator',
  webcam: 'Played over webcam',
  offline: 'Played in person',
  unknown: 'Setting not recorded',
};

const TIERS: Record<string, string> = {
  worlds: 'Worlds',
  finals: 'Finals',
  championship: 'Championship',
  treasure: 'Treasure Cup',
  regional: 'Regional',
  store: 'Store / shop event',
  qualifier: 'Qualifier',
  local: 'Local',
};

export default function EventView({ id }: { id: string }) {
  const [event, setEvent] = useState<ShardEvent | null>(null);
  const [leaders, setLeaders] = useState<Leaders>({});
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    Promise.all([getEvent(id), loadLeaders()])
      .then(([found, table]) => {
        if (cancelled) return;
        setLeaders(table);
        if (!found) return setState('missing');
        setEvent(found);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const name = (leaderId: string) => leaders[leaderId]?.n ?? leaderId;
  const colors = (leaderId: string) => leaders[leaderId]?.c ?? [];

  if (state === 'loading') {
    return (
      <div className="shell" style={{ paddingBlock: '2rem 3rem' }}>
        <p className="eyebrow">
          <Link href="/decks">Metagame</Link> · Event
        </p>
        <p className="muted" style={{ marginTop: '1.5rem' }}>
          Loading this event…
        </p>
      </div>
    );
  }

  if (state !== 'ready' || !event) {
    return (
      <div className="shell" style={{ paddingBlock: '2rem 3rem' }}>
        <p className="eyebrow">
          <Link href="/decks">Metagame</Link> · Event
        </p>
        <h1 className="display" style={{ fontSize: '1.6rem', margin: '0.6rem 0 0' }}>
          {state === 'missing' ? 'No such event' : 'Could not load this event'}
        </h1>
        <p className="muted" style={{ marginTop: '0.8rem', maxWidth: '60ch' }}>
          {state === 'missing'
            ? 'Nothing on record has this id. It may have been merged into another event, or the link may be mistyped.'
            : 'The results file did not load. Check your connection and reload.'}
        </p>
        <p style={{ marginTop: '1.2rem' }}>
          <Link href="/decks">Back to the metagame →</Link>
        </p>
      </div>
    );
  }

  const withPlacing = event.decks.filter((d) => d.p !== null).length;

  return (
    <div className="shell" style={{ paddingBlock: '2rem 3rem' }}>
      <p className="eyebrow">
        <Link href="/decks">Metagame</Link> · Event
      </p>
      <h1
        className="display"
        style={{ fontSize: 'clamp(1.5rem, 3.2vw, 2.3rem)', margin: '0.4rem 0 0' }}
      >
        {event.name}
      </h1>

      <div className="card-line" style={{ marginTop: '0.7rem' }}>
        <span className="mono">{event.date}</span>
        <span className="dot">·</span>
        <span>{TIERS[event.tier] ?? 'Local'}</span>
        <span className="dot">·</span>
        <span>{event.region === 'jp' ? 'Japan' : 'English'}</span>
        <span className="dot">·</span>
        <span className="muted">{VENUES[event.venue] ?? VENUES.unknown}</span>
      </div>

      <dl className="stats" style={{ marginTop: '1.35rem' }}>
        <div className="stat">
          <dt>Entrants</dt>
          <dd className={event.players ? undefined : 'small none'}>
            {event.players || 'Not recorded'}
          </dd>
        </div>
        <div className="stat">
          <dt>Lists held</dt>
          <dd>{event.recorded}</dd>
        </div>
        <div className="stat">
          <dt>Archetypes</dt>
          <dd>{event.archetypes.length}</dd>
        </div>
        <div className="stat">
          <dt>Winner</dt>
          <dd className={`small${event.winner ? '' : ' none'}`}>
            {event.winner ? event.winner.a : 'Not recorded'}
          </dd>
        </div>
      </dl>

      {/*
        Lists held is not the size of the field. Limitless publishes whole Swiss
        fields; Top Decks publishes the decks that placed. Saying "17 decks" without
        that distinction would read as a 17-player event.
      */}
      <p className="muted" style={{ fontSize: '0.76rem', marginTop: '0.9rem', maxWidth: '74ch' }}>
        {event.recorded} decklist{event.recorded === 1 ? '' : 's'} on record
        {event.players ? ` from a field of ${event.players}` : ''}, via{' '}
        {event.source === 'limitless' ? (
          'Limitless'
        ) : event.sourceUrl ? (
          <a href={event.sourceUrl} target="_blank" rel="noreferrer noopener">
            One Piece Top Decks
          </a>
        ) : (
          'One Piece Top Decks'
        )}
        .{' '}
        {event.source === 'limitless'
          ? 'Whole-field results, so the standings below are the tournament.'
          : 'Only decks that placed are published, so this is the top of the standings rather than the whole field.'}
      </p>

      {event.winner ? (
        <>
          <div className="section-head" style={{ marginTop: '2rem' }}>
            <h2 className="display">Winner</h2>
          </div>
          <Link
            href={`/deck/${event.winner.i}`}
            className="event-winner"
            style={
              { '--pigment': pigment(colors(event.winner.l)[0] ?? '') } as React.CSSProperties
            }
          >
            <img src={art(event.winner.l, 320)} alt="" />
            <span style={{ minWidth: 0 }}>
              <b className="display" style={{ fontSize: '1.2rem' }}>
                {name(event.winner.l)}
              </b>
              <span className="event-winner-meta">
                <Pips colors={colors(event.winner.l)} />
                {event.winner.a}
                {event.winner.w + event.winner.s > 0 ? (
                  <span className="mono">
                    {' '}
                    · {formatRecord(event.winner.w, event.winner.s, event.winner.t)}
                  </span>
                ) : null}
              </span>
            </span>
          </Link>
        </>
      ) : null}

      <div className="section-head" style={{ marginTop: '2.25rem' }}>
        <h2 className="display">{event.source === 'limitless' ? 'Standings' : 'Recorded lists'}</h2>
        <span className="muted" style={{ fontSize: '0.78rem' }}>
          {withPlacing > 0 ? 'Best finishes first' : 'Placings not recorded'}
        </span>
      </div>

      <div className="table-scroll">
        <table className="meta-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'right' }}>Place</th>
              <th style={{ textAlign: 'right' }}>Record</th>
              <th>Player</th>
              <th>Deck</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {event.decks.map((deck) => (
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
                  {isNamedPlayer(deck.a) ? (
                    <Link href={`/player/${playerSlug(deck.a)}`} className="player-link">
                      {deck.a}
                    </Link>
                  ) : (
                    <span className="muted">{deck.a}</span>
                  )}
                </td>
                <td>
                  <Link href={`/decks/${deck.l.toLowerCase()}`} className="meta-leader">
                    <img src={art(deck.l, 96)} alt="" loading="lazy" />
                    <span style={{ minWidth: 0 }}>
                      <span className="meta-leader-name" style={{ display: 'block' }}>
                        {name(deck.l)}
                      </span>
                      <span className="meta-leader-id">{deck.l}</span>
                    </span>
                  </Link>
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

      {event.archetypes.length > 1 ? (
        <>
          <div className="section-head" style={{ marginTop: '2.5rem' }}>
            <h2 className="display">What was played</h2>
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              {event.archetypes.length} archetypes across {event.recorded} lists
            </span>
          </div>
          <div className="player-decks">
            {event.archetypes.map((a) => (
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
                    {a.count} list{a.count === 1 ? '' : 's'}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
