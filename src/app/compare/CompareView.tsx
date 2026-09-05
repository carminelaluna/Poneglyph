'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { art } from '@/lib/art';
import { DAY_WINDOWS, filterDecks, type MetaIndex } from '@/lib/meta';
import { IndexError, useMetaIndex, useWindow } from '../decks/useMeta';

/**
 * The two regions side by side, which is the one question a metagame page split by
 * corpus cannot answer: what is winning in Japan that has not reached English yet.
 *
 * ## Why this counts wins and not decks
 *
 * The share on `/decks` is not the same measurement in the two regions, and
 * subtracting one from the other would be the worst kind of wrong number — one that
 * looks right. English is `mixed`: 58,399 of its decks come from whole Swiss fields
 * published by Limitless, so its share is "of everyone who turned up". Japanese is
 * `winners`, every row a deck that placed, because Limitless is an English-corpus
 * source and Top Decks publishes finishing lists. A share over winners reads high
 * for whatever wins, so the two numbers are not comparable and never were.
 *
 * First places are. Both corpora record who won an event, identically, and that is
 * the whole of what this page counts. It is a smaller number than either region's
 * deck count — 287 and 481 across ninety days — so every row carries its sample and
 * the thin ones are held back.
 *
 * ## Why a Leader can be missing rather than unplayed
 *
 * The card pools differ: five sets entered play in Japanese that never did in
 * English, and two the other way. So an archetype absent from a region may be
 * absent because nobody plays it, or because it does not exist there — opposite
 * meanings from the same empty cell. `leaders` is per corpus, so a Leader that
 * region has never recorded at all is labelled rather than drawn as 0%.
 */

/** Below this in both regions, a share of wins is one event, not a metagame. */
const MIN_WINS = 2;

type Row = {
  leaderId: string;
  name: string;
  colors: string[];
  jpWins: number;
  enWins: number;
  jpShare: number;
  enShare: number;
  gap: number;
  jpKnown: boolean;
  enKnown: boolean;
};

/** First places per Leader, and how many there were in total. */
function winsBy(index: MetaIndex, window_: Parameters<typeof filterDecks>[1]) {
  const won = filterDecks(index, window_, [], []).filter((d) => d.p === 1);
  const by = new Map<string, number>();
  for (const d of won) by.set(d.l, (by.get(d.l) ?? 0) + 1);
  return { total: won.length, by };
}

export default function CompareView() {
  const { window: window_, setWindow, query } = useWindow();
  const en = useMetaIndex('en', window_);
  const jp = useMetaIndex('jp', window_);

  const view = useMemo(() => {
    if (!en.index || !jp.index) return null;
    const E = winsBy(en.index, window_);
    const J = winsBy(jp.index, window_);

    const leaders = new Set([...E.by.keys(), ...J.by.keys()]);
    const rows: Row[] = [];
    for (const leaderId of leaders) {
      const enWins = E.by.get(leaderId) ?? 0;
      const jpWins = J.by.get(leaderId) ?? 0;
      if (Math.max(enWins, jpWins) < MIN_WINS) continue;
      const meta = jp.index.leaders[leaderId] ?? en.index.leaders[leaderId];
      const enShare = E.total ? (enWins / E.total) * 100 : 0;
      const jpShare = J.total ? (jpWins / J.total) * 100 : 0;
      rows.push({
        leaderId,
        name: meta?.n ?? leaderId,
        colors: meta?.c ?? [],
        enWins,
        jpWins,
        enShare,
        jpShare,
        gap: jpShare - enShare,
        /* Recorded in that corpus at all, ever — not merely in this window. */
        enKnown: leaderId in en.index.leaders,
        jpKnown: leaderId in jp.index.leaders,
      });
    }

    rows.sort((a, b) => b.gap - a.gap);
    return { rows, enTotal: E.total, jpTotal: J.total };
  }, [en.index, jp.index, window_]);

  if (en.error) return <IndexError error={en.error} />;
  if (jp.error) return <IndexError error={jp.error} />;
  if (!en.index || !jp.index || !view) return <p className="empty">Reading both corpora…</p>;

  const { rows, enTotal, jpTotal } = view;
  /* The bar is drawn against the widest gap on screen, so it always says something. */
  const widest = Math.max(6, ...rows.map((r) => Math.abs(r.gap)));

  return (
    <>
      <div className="window-bar">
        <div className="window-chips" role="group" aria-label="Time window">
          {DAY_WINDOWS.map((days) => (
            <button
              key={days}
              type="button"
              className="window-chip"
              aria-pressed={window_.kind === 'days' && window_.days === days}
              onClick={() => setWindow({ kind: 'days', days })}
            >
              {days}d
            </button>
          ))}
          <button
            type="button"
            className="window-chip"
            aria-pressed={window_.kind === 'all'}
            onClick={() => setWindow({ kind: 'all' })}
          >
            All
          </button>
        </div>
        <span className="window-count">
          <b>{jpTotal.toLocaleString('en-US')}</b> Japanese and{' '}
          <b>{enTotal.toLocaleString('en-US')}</b> English first places
        </span>
      </div>

      {/*
        Conditional in the same sense as MetaBrowser's two warnings: this describes
        the table in front of you, not the archive in general. Without it the column
        heading "Share of wins" reads as the share on /decks, which it is not.
      */}
      <p className="muted source-line" style={{ maxWidth: '74ch', marginTop: '1rem' }}>
        <strong>Share of first places, not of decks.</strong> The English corpus holds whole
        Swiss fields and the Japanese one holds decks that placed, so their deck shares
        measure different things. Who won an event is recorded the same way in both, so
        that is what this counts — and every row shows how many wins it is from.
      </p>

      {rows.length === 0 ? (
        <p className="empty">Nothing with {MIN_WINS} wins in either region in this window.</p>
      ) : (
        <div className="table-scroll">
          <table className="meta-table">
            <thead>
              <tr>
                <th>Archetype</th>
                <th style={{ textAlign: 'right' }}>Japanese</th>
                <th style={{ textAlign: 'right' }}>English</th>
                <th>Where it wins</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.leaderId}>
                  <td>
                    <Link href={`/decks/${r.leaderId.toLowerCase()}`} className="meta-leader">
                      <img src={art(r.leaderId, 96)} alt="" loading="lazy" />
                      <span style={{ minWidth: 0 }}>
                        <span className="meta-leader-name" style={{ display: 'block' }}>
                          {r.name}
                        </span>
                        <span className="meta-leader-id">
                          {r.colors.join('/')} · {r.leaderId}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Share share={r.jpShare} wins={r.jpWins} known={r.jpKnown} />
                  </td>
                  <td className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Share share={r.enShare} wins={r.enWins} known={r.enKnown} />
                  </td>
                  <td>
                    {/*
                      The same two-sided bar the matchup table uses, and for the same
                      reason: a single left-to-right bar makes "ahead in Japan" and
                      "ahead in English" differ only by length.
                    */}
                    <span className="matchup-bar" title={`${r.gap > 0 ? '+' : ''}${r.gap.toFixed(1)} points in Japanese`}>
                      <span className="matchup-half left">
                        <i style={{ width: `${r.gap < 0 ? (-r.gap / widest) * 100 : 0}%` }} />
                      </span>
                      <span className="matchup-half right">
                        <i style={{ width: `${r.gap > 0 ? (r.gap / widest) * 100 : 0}%` }} />
                      </span>
                      <b className="mono compare-side">
                        {Math.abs(r.gap) < 0.5 ? 'even' : r.gap > 0 ? 'JP' : 'EN'}
                      </b>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted source-line" style={{ maxWidth: '74ch', marginTop: '1.2rem' }}>
        <strong>Not recorded is not zero.</strong> The two regions have different card
        pools — five sets entered play in Japanese that never did in English, and two the
        other way — so an archetype missing from one may be missing because nobody plays
        it or because it does not exist there. Where a corpus has never recorded a Leader
        at all, the cell says so rather than showing 0%.{' '}
        <Link href="/data" className="inline-link">
          How the archive is built
        </Link>
        .
      </p>

      <p style={{ marginTop: '1.4rem' }}>
        <Link href={query ? `/decks?${query}` : '/decks'} className="chip">
          ← Back to the metagame
        </Link>
      </p>
    </>
  );
}

/** A share with its sample, or the reason there is no share to give. */
function Share({ share, wins, known }: { share: number; wins: number; known: boolean }) {
  if (wins === 0 && !known) return <span className="muted small">Not recorded</span>;
  if (wins === 0) return <span className="muted">—</span>;
  return (
    <>
      {share.toFixed(1)}%
      <span className="muted" style={{ fontSize: '0.76rem' }}>
        {' '}
        /{wins}
      </span>
    </>
  );
}
