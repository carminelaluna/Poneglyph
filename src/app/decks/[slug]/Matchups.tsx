'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { art } from '@/lib/art';
import { dataUrl } from '@/lib/paths';
import { loadLeaders, type Leaders } from '@/lib/shards';

const MIN_GAMES = 5;

type Row = [number, string, number];
type Payload = { days: string[]; rows: Row[] };

type Tally = {
  leaderId: string;
  wins: number;
  losses: number;
  draws: number;
  games: number;
  rate: number;
};

export default function Matchups({
  leaderId,
  from,
  to,
  region,
  limit,
  moreHref,
}: {
  leaderId: string;
  from: string | null;
  to: string | null;
  region: 'en' | 'jp';
  limit?: number;
  moreHref?: string;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [leaders, setLeaders] = useState<Leaders>({});
  const [missing, setMissing] = useState(false);
  const [showThin, setShowThin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPayload(null);
    setMissing(false);

    Promise.all([
      fetch(dataUrl(`matchups/${leaderId}.json`)).then((res) => (res.ok ? res.json() : null)),
      loadLeaders(),
    ])
      .then(([data, names]) => {
        if (cancelled) return;
        if (!data) setMissing(true);
        else setPayload(data as Payload);
        setLeaders(names);
      })
      .catch(() => !cancelled && setMissing(true));

    return () => {
      cancelled = true;
    };
  }, [leaderId]);

  const tallies = useMemo(() => {
    if (!payload) return [];
    const byOpponent = new Map<string, Tally>();

    for (const [day, opponent, result] of payload.rows) {
      const on = payload.days[day] ?? '';
      if (from && on < from) continue;
      if (to && on >= to) continue;

      let tally = byOpponent.get(opponent);
      if (!tally) {
        tally = { leaderId: opponent, wins: 0, losses: 0, draws: 0, games: 0, rate: 0 };
        byOpponent.set(opponent, tally);
      }
      if (result === 1) tally.wins++;
      else if (result === 0) tally.losses++;
      else tally.draws++;
      tally.games++;
    }

    return [...byOpponent.values()]
      .map((t) => ({ ...t, rate: t.games ? (t.wins / t.games) * 100 : 0 }))
      .sort((a, b) => b.games - a.games || b.rate - a.rate);
  }, [payload, from, to]);

  if (region === 'jp') {
    return (
      <div className="meta-block" style={{ marginTop: '2.25rem' }}>
        <h2>Matchups</h2>
        <p className="muted" style={{ fontSize: '0.78rem', margin: 0 }}>
          Not for the Japanese corpus. Matchups are built from Limitless brackets,
          which cover English events — the Japanese results here come from One Piece
          Top Decks, which publishes finishing lists rather than pairings.
        </p>
      </div>
    );
  }

  if (missing) {
    return (
      <div className="meta-block" style={{ marginTop: '2.25rem' }}>
        <h2>Matchups</h2>
        <p className="muted" style={{ fontSize: '0.78rem', margin: 0 }}>
          No recorded pairings for this archetype yet. They come from Limitless
          brackets, which the ingest reads one tournament at a time.
        </p>
      </div>
    );
  }

  if (!payload) return null;

  const solid = tallies.filter((t) => t.games >= MIN_GAMES);
  const thin = tallies.filter((t) => t.games < MIN_GAMES);
  const capped = limit !== undefined;
  const shown = capped ? solid.slice(0, limit) : showThin ? [...solid, ...thin] : solid;
  const hidden = tallies.length - shown.length;
  const games = tallies.reduce((n, t) => n + t.games, 0);

  return (
    <div className="matchups">
      <div className="section-head" style={{ marginTop: '2.5rem' }}>
        <h2 className="display">Matchups</h2>
        <span className="muted" style={{ fontSize: '0.78rem' }}>
          {games.toLocaleString('en-US')} recorded games
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="empty">
          {tallies.length === 0
            ? 'No pairings recorded in this window.'
            : `Nothing with ${MIN_GAMES} games or more in this window.`}
        </p>
      ) : (
        <div className="table-scroll">
          <table className="meta-table">
            <thead>
              <tr>
                <th>Against</th>
                <th>Win rate</th>
                <th style={{ textAlign: 'right' }}>Record</th>
                <th style={{ textAlign: 'right' }}>Games</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.leaderId} className={t.games < MIN_GAMES ? 'matchup-thin' : undefined}>
                  <td>
                    <Link href={`/decks/${t.leaderId.toLowerCase()}`} className="meta-leader">
                      <img src={art(t.leaderId, 96)} alt="" loading="lazy" />
                      <span className="meta-leader-name">
                        {leaders[t.leaderId]?.n ?? t.leaderId}
                      </span>
                    </Link>
                  </td>
                  <td>
                    <span className="matchup-bar">
                      <span className="matchup-half left">
                        <i style={{ width: `${t.rate < 50 ? (50 - t.rate) * 2 : 0}%` }} />
                      </span>
                      <span className="matchup-half right">
                        <i style={{ width: `${t.rate > 50 ? (t.rate - 50) * 2 : 0}%` }} />
                      </span>
                      <b className="mono">{t.rate.toFixed(0)}%</b>
                    </span>
                  </td>
                  <td className="mono muted" style={{ textAlign: 'right' }}>
                    {t.wins}–{t.losses}
                    {t.draws ? `–${t.draws}` : ''}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {t.games}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {capped ? (
        hidden > 0 && moreHref ? (
          <p style={{ marginTop: '0.7rem' }}>
            <Link href={moreHref} className="chip">
              All {tallies.length} matchups →
            </Link>
          </p>
        ) : null
      ) : thin.length > 0 ? (
        <p style={{ marginTop: '0.7rem' }}>
          <button type="button" className="link-btn" onClick={() => setShowThin(!showThin)}>
            {showThin
              ? `Hide the ${thin.length} under ${MIN_GAMES} games`
              : `Show ${thin.length} more with fewer than ${MIN_GAMES} games`}
          </button>
        </p>
      ) : null}
    </div>
  );
}
