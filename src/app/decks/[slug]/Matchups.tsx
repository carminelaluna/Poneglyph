'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { art } from '@/lib/art';
import { dataUrl } from '@/lib/paths';
import { loadLeaders, type Leaders } from '@/lib/shards';

/**
 * This archetype against every other, from recorded pairings.
 *
 * Every other win rate on this site is a record against *the field* — 52.8% means
 * it beat whatever it happened to sit across from. This is the narrower question
 * people actually ask about a deck, and until the matchup ingest existed the
 * archive could not answer it at all: standings carry a record, not an opponent.
 *
 * Three things this table is careful about.
 *
 * **The sample is printed beside every number.** A matchup is one row of a Swiss
 * pairing sheet, so a pair of archetypes can meet three times in a month; 67% from
 * three games is noise wearing a percentage. Rows under `MIN_GAMES` are held back
 * behind a click rather than mixed in.
 *
 * **Draws are counted and shown**, not silently dropped into losses. A timed round
 * that ended level is a real outcome and both decks failed to win it.
 *
 * **It is Limitless only.** Top Decks publishes finishing lists and organizers are
 * not asked for brackets, so this covers part of the corpus — which the blurb says
 * rather than leaving the reader to assume it covers all of it.
 */

/** Below this, a percentage says more about the sample than about the matchup. */
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
}: {
  leaderId: string;
  from: string | null;
  /* Exclusive, and set only for an era — see windowEnd in lib/meta.ts. */
  to: string | null;
  region: 'en' | 'jp';
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
      /*
       * The same window the rest of the page is showing, so the table below the
       * share figure is talking about the same matches. `from` is null for "all
       * recorded", and a row whose day is missing from the file is kept rather
       * than guessed at.
       */
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

  /*
   * Limitless is an English-corpus source, so there are no Japanese pairings to
   * have. Showing the English table under the Japanese view would be the worst
   * option of the three: it is a real table of real matches about a different
   * metagame, and nothing on the page would say so.
   */
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
  const shown = showThin ? [...solid, ...thin] : solid;
  const games = tallies.reduce((n, t) => n + t.games, 0);

  return (
    <div className="matchups">
      <div className="section-head" style={{ marginTop: '2.5rem' }}>
        <h2 className="display">Matchups</h2>
        <span className="muted" style={{ fontSize: '0.78rem' }}>
          {games.toLocaleString('en-US')} recorded games
        </span>
      </div>

      <p className="muted" style={{ fontSize: '0.76rem', margin: '0 0 0.8rem', maxWidth: '70ch' }}>
        From published brackets, so this is a record against a named opponent rather than
        against the field. Limitless events only — the other sources publish finishing lists,
        not pairings — and mirrors are left out, since a deck beats itself half the time.
      </p>

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
                    {/*
                      Two-sided, from an axis at 50%: a losing matchup grows left and
                      a winning one grows right. A single bar running left to right
                      makes 52% and 32% differ only in length and colour, and the two
                      colours this palette has to spend on it are orange and red.
                    */}
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

      {thin.length > 0 ? (
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
