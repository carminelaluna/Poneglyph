'use client';

import { useEffect, useMemo, useState } from 'react';
import { art, artSrcSet } from '@/lib/art';
import Link from 'next/link';
import EventLink from '../EventLink';
import Matchups from './Matchups';
import PlayerLink from '../PlayerLink';
import { pigment } from '@/lib/colors';
import { dataUrl } from '@/lib/paths';
import {
  aggregate,
  archetypeCards,
  filterDecks,
  formatRecord,
  ordinal,
  windowEnd,
  windowStart,
  type DeckCardLists,
  type MetaCard,
} from '@/lib/meta';
import { WindowBar, WinRate, useMetaIndex, useWindow } from '../useMeta';

/**
 * Everything about an archetype that depends on the chosen window: its share and
 * record, the cards that define it, and the lists people actually registered.
 *
 * The page shell around this — leader art, name, rules text — stays server
 * rendered, because that part is the archetype's identity and does not move.
 */
/**
 * How the decklist table is ordered.
 *
 * Best finish is still the default — it is what an archetype page is usually read
 * for — but it must not be the only one. Sorted by finish and capped, a four-year
 * window shows sixty first places and nothing else, so every deck older than the
 * last sixty wins is unreachable however far back you set the window.
 */
const ORDERS = [
  ['finish', 'Best finish'],
  ['newest', 'Newest'],
  ['oldest', 'Oldest'],
] as const;

export default function ArchetypeView({ leaderId, glow }: { leaderId: string; glow: string }) {
  const { window: window_, setWindow, venues, setVenues, tiers, setTiers, region, setRegion } = useWindow();
  const { index, error, loadingArchive } = useMetaIndex(region, window_);
  const [lists, setLists] = useState<DeckCardLists | null>(null);
  /*
   * How the decklists below are ordered, and how many are drawn.
   *
   * Both exist because of the same complaint: the table was sorted by finish and
   * capped at sixty with no way past it, so an archetype with nine hundred results
   * showed sixty first places — the newest sixty — however far back the window
   * reached. "Show me the old ones" had no answer on the page.
   */
  const [order, setOrder] = useState<'finish' | 'newest' | 'oldest'>('finish');
  const [limit, setLimit] = useState(60);

  /*
   * Card lists for this archetype only. They are a fifth of the whole corpus, so
   * they are fetched here rather than shipped with the metagame table that every
   * visitor loads.
   */
  useEffect(() => {
    let cancelled = false;
    const dir = region === 'jp' ? 'decks-jp' : 'decks-en';
    fetch(dataUrl(`${dir}/${leaderId}.json`))
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: DeckCardLists) => {
        if (!cancelled) setLists(data);
      })
      .catch(() => {
        if (!cancelled) setLists({});
      });
    return () => {
      cancelled = true;
    };
  }, [leaderId, region]);

  const view = useMemo(() => {
    if (!index) return null;
    const windowed = filterDecks(index, window_, venues, tiers);
    const all = aggregate(windowed, index);
    const mine = all.find((a) => a.leaderId === leaderId) ?? null;
    const decks = windowed
      .filter((d) => d.l === leaderId)
      .sort((a, b) => {
        if (order === 'newest') return b.d.localeCompare(a.d) || (a.p ?? 999) - (b.p ?? 999);
        if (order === 'oldest') return a.d.localeCompare(b.d) || (a.p ?? 999) - (b.p ?? 999);
        /* A deck with no recorded placing sorts last rather than first. */
        return (a.p ?? 999) - (b.p ?? 999) || b.d.localeCompare(a.d) || b.w - a.w;
      });
    const built = lists
      ? archetypeCards(decks.map((d) => d.i), lists, index)
      : null;
    /*
     * The range the table covers, read off the dates rather than off the ends of
     * the list — those are only oldest-to-newest while the sort happens to be by
     * date, and printed straight they came out backwards.
     */
    const days = decks.map((d) => d.d).sort();
    const span = days.length ? { from: days[0], to: days[days.length - 1] } : null;

    return { mine, decks, built, span };
  }, [index, window_, venues, tiers, leaderId, lists, order]);

  if (error) {
    return (
      <p className="empty">
        The deck index did not load ({error}). Run <code className="mono">npm run ingest:decks</code>{' '}
        to build it.
      </p>
    );
  }
  if (!index || !view) return <p className="empty">Reading tournament results…</p>;

  const { mine, decks, built, span } = view;

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
        noun="decks of this archetype"
      />

      {!mine || decks.length === 0 ? (
        <div className="empty">
          <p>This archetype has no recorded results in the chosen window.</p>
          <button type="button" className="link-btn" onClick={() => setWindow({ kind: 'all' })}>
            Show all recorded results
          </button>
        </div>
      ) : (
        <>
          <dl className="stats">
            <div className="stat">
              <dt>{(index.fieldDecks ?? 0) > 0 ? 'Share' : 'Share of wins'}</dt>
              <dd>{mine.share.toFixed(2)}%</dd>
            </div>
            <div className="stat">
              <dt>Decks</dt>
              <dd>{mine.decks}</dd>
            </div>
            {(index.fieldDecks ?? 0) > 0 && mine.winRateSample > 0 ? (
              <>
                <div className="stat">
                  <dt>Win rate</dt>
                  <dd className={mine.winRate === null ? 'none' : undefined}>
                    {mine.winRate === null ? '—' : `${mine.winRate.toFixed(1)}%`}
                  </dd>
                  <dd className="small muted" style={{ marginTop: '0.15rem' }}>
                    from {mine.winRateSample} field decks
                  </dd>
                </div>
                <div className="stat">
                  <dt>Record</dt>
                  <dd className="small">{formatRecord(mine.wins, mine.losses, mine.ties)}</dd>
                </div>
              </>
            ) : null}
            <div className="stat">
              <dt>Top 8</dt>
              <dd>{mine.top8}</dd>
            </div>
            <div className="stat">
              <dt>Wins</dt>
              <dd>{mine.firsts}</dd>
            </div>
          </dl>

          {built ? (
            <>
              <CardBand
                title="Core"
                blurb="In at least 60% of lists — the skeleton every build shares."
                cards={built.core}
                glow={glow}
              />
              <CardBand
                title="Flex"
                blurb="Between 10% and 60% — where builds actually differ."
                cards={built.flex}
                glow={glow}
              />
            </>
          ) : (
            <p className="empty">Reading decklists…</p>
          )}

          {/*
            Against a named opponent, from published brackets — the question the
            field-wide win rate above cannot answer. Given the same window as
            everything else on the page so the two are talking about one set of
            matches.
          */}
          <Matchups
            leaderId={leaderId}
            from={windowStart(window_, index)}
            to={windowEnd(window_, index)}
            region={region}
          />

          <div className="section-head" style={{ marginTop: '2.5rem' }}>
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
                    setLimit(60);
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
                {decks.slice(0, limit).map((deck) => (
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

          {decks.length > limit ? (
            <p style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="chip chip-link"
                onClick={() => setLimit(limit + 200)}
              >
                Show more
              </button>
            </p>
          ) : null}
        </>
      )}
    </>
  );
}

/** A row of cards with their inclusion rate drawn underneath as a filled rule. */
function CardBand({
  title,
  blurb,
  cards,
  glow,
}: {
  title: string;
  blurb: string;
  cards: MetaCard[];
  glow: string;
}) {
  if (cards.length === 0) return null;
  return (
    <>
      <div className="section-head" style={{ marginTop: '2.25rem' }}>
        <h2 className="display">
          {title} <span className="muted">— {cards.length}</span>
        </h2>
        <span className="muted" style={{ fontSize: '0.78rem' }}>
          {blurb}
        </span>
      </div>
      <div className="skeleton">
        {cards.map((card) => (
          <Link
            key={card.id}
            href={`/cards/${card.id.toLowerCase()}`}
            className="skel-card"
            title={`${card.name} — in ${card.inclusion}% of lists, ${card.avgCopies} copies on average`}
          >
            <img
              src={art(card.id, 320)}
              srcSet={artSrcSet(card.id)}
              sizes="122px"
              alt={card.name}
              loading="lazy"
            />
            <span className="skel-copies">{card.avgCopies.toFixed(1)}×</span>
            <div
              className="skel-incl"
              style={{ '--incl': `${card.inclusion}%`, '--pigment': glow } as React.CSSProperties}
            >
              <i />
            </div>
            <div className="skel-label">
              <b>{card.name}</b>
              <span>{Math.round(card.inclusion)}%</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
