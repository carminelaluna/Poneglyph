'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { art } from '@/lib/art';
import { DAY_WINDOWS, filterDecks, type MetaIndex } from '@/lib/meta';
import { IndexError, useMetaIndex, useWindow } from '../decks/useMeta';

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
