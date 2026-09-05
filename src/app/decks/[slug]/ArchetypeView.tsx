'use client';

import { useEffect, useMemo, useState } from 'react';
import { art, artSrcSet } from '@/lib/art';
import Link from 'next/link';
import DeckTable from './DeckTable';
import Matchups from './Matchups';
import { pigment } from '@/lib/colors';
import { dataUrl } from '@/lib/paths';
import {
  aggregate,
  archetypeCards,
  filterDecks,
  formatRecord,
  windowEnd,
  windowStart,
  type DeckCardLists,
  type MetaCard,
} from '@/lib/meta';
import { IndexError, WinRate, WindowBar, useMetaIndex, useWindow, windowHref } from '../useMeta';

/**
 * Everything about an archetype that depends on the chosen window: its share and
 * record, the cards that define it, and the lists people actually registered.
 *
 * The page shell around this — leader art, name, rules text — stays server
 * rendered, because that part is the archetype's identity and does not move.
 */
/**
 * How many lists this page draws before handing over to `/decklists`.
 *
 * Sorted by finish, ten is the ten most recent first places wherever the archetype
 * has ten — which is what this section is read for. Where it does not, the same
 * sort answers with the ten best finishes instead of an empty section, and that
 * matters more than it sounds: in the default thirty-day window, 62% of archetypes
 * with recorded results have no first place at all, and one of them has 31 decks on
 * record. Cutting strictly to winners would have left the majority of these pages
 * saying nothing about results they plainly have.
 */
const HEAD = 10;

export default function ArchetypeView({
  leaderId,
  slug,
  glow,
}: {
  leaderId: string;
  /* Passed rather than derived: the two sub-pages are addressed by it. */
  slug: string;
  glow: string;
}) {
  const { window: window_, setWindow, venues, tiers, region, bar, query } = useWindow();
  const { index, error, loadingArchive } = useMetaIndex(region, window_);
  const [lists, setLists] = useState<DeckCardLists | null>(null);

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
    /*
     * Best finish, newest first within a placing — so the head of this list is the
     * most recent wins. A deck with no recorded placing sorts last rather than
     * first. The other two orders live on the full page, which is where a reader
     * asking for the oldest lists is going anyway.
     */
    const decks = windowed
      .filter((d) => d.l === leaderId)
      .sort((a, b) => (a.p ?? 999) - (b.p ?? 999) || b.d.localeCompare(a.d) || b.w - a.w);
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
  }, [index, window_, venues, tiers, leaderId, lists]);

  if (error) return <IndexError error={error} />;
  if (!index || !view) return <p className="empty">Reading tournament results…</p>;

  const { mine, decks, built, span } = view;

  return (
    <>
      <WindowBar {...bar} index={index} count={decks.length} noun="decks of this archetype" />

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
            limit={HEAD}
            moreHref={windowHref(`/decks/${slug}/matchups`, query)}
          />

          <div className="section-head" style={{ marginTop: '2.5rem' }}>
            <h2 className="display">Decklists</h2>
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              {decks.length.toLocaleString('en-US')} in this window
            </span>
          </div>

          <p className="muted source-line" style={{ marginTop: '0.2rem' }}>
            Best finish first
            {span ? (
              <>
                {' '}
                · {span.from} to {span.to}
              </>
            ) : null}
          </p>

          <DeckTable decks={decks.slice(0, HEAD)} />

          {decks.length > HEAD ? (
            <p style={{ marginTop: '1rem' }}>
              <Link href={windowHref(`/decks/${slug}/decklists`, query)} className="chip">
                All {decks.length.toLocaleString('en-US')} decklists →
              </Link>
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
