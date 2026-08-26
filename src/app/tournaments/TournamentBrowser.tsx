'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { art } from '@/lib/art';
import { fold, tierLabel, toEvent, venueLabel, type EventRow, type Region } from '@/lib/directory';
import {
  loadLeaders,
  loadTournamentArchive,
  loadTournaments,
  type Leaders,
} from '@/lib/shards';

/**
 * Every tournament in the corpus, most recent first.
 *
 * The default is the last ninety days, which is 11 KB and answers what nearly
 * everyone arrives asking. Reaching further loads the archive once — 106 KB for the
 * remaining six thousand events, which is a fair price for a question somebody
 * chose to ask and a poor one to charge everybody up front.
 *
 * Recorded decks, not entrants, is the figure in the last column: Top Decks
 * publishes only what placed, so a 128-player Regional can be four rows here. Both
 * are shown, and where a source reported no field size it says so rather than
 * printing a zero that reads as "nobody came".
 */

const REGIONS: { id: Region | 'all'; label: string }[] = [
  { id: 'all', label: 'Both' },
  { id: 'en', label: 'English' },
  { id: 'jp', label: 'Japanese' },
];

const VENUES = ['offline', 'simulator', 'webcam'] as const;

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

export default function TournamentBrowser() {
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [archived, setArchived] = useState(0);
  const [recentFrom, setRecentFrom] = useState<string | null>(null);
  const [leaders, setLeaders] = useState<Leaders>({});
  const [error, setError] = useState<string | null>(null);

  const [everything, setEverything] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [region, setRegion] = useState<Region | 'all'>('all');
  const [venue, setVenue] = useState<string>('all');
  const [tier, setTier] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    Promise.all([loadTournaments(), loadLeaders()])
      .then(([index, names]) => {
        setRows(index.events);
        setTotal(index.total);
        setArchived(index.archived);
        setRecentFrom(index.recentFrom);
        setLeaders(names);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load.'));
  }, []);

  const showEverything = async () => {
    setLoadingAll(true);
    try {
      const archive = await loadTournamentArchive();
      setRows((held) => [...(held ?? []), ...archive.events]);
      setEverything(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the archive.');
    } finally {
      setLoadingAll(false);
    }
  };

  /* Tiers actually present, so the filter never offers an empty answer. */
  const tiers = useMemo(() => {
    const seen = new Set<string>();
    for (const row of rows ?? []) seen.add(row[4]);
    return [...seen].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = fold(query.trim());
    return (rows ?? [])
      .filter(
        (row) =>
          (region === 'all' || row[3] === region) &&
          (venue === 'all' || row[5] === venue) &&
          (tier === 'all' || row[4] === tier) &&
          (!needle || fold(row[1]).includes(needle))
      )
      .map(toEvent);
  }, [rows, region, venue, tier, query]);

  useEffect(() => setLimit(100), [region, venue, tier, query, everything]);

  if (error) return <p className="empty">The tournament list did not load ({error}).</p>;
  if (!rows) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="dir-controls">
        <input
          className="control dir-search"
          type="search"
          placeholder="Search by event name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search tournaments by name"
        />
        <span className="chip-row">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              type="button"
              className="chip"
              aria-pressed={region === r.id}
              onClick={() => setRegion(r.id)}
            >
              {r.label}
            </button>
          ))}
        </span>
        <select
          className="control dir-select"
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          aria-label="Filter by play setting"
        >
          <option value="all">Any setting</option>
          {VENUES.map((v) => (
            <option key={v} value={v}>
              {venueLabel(v)}
            </option>
          ))}
        </select>
        <select
          className="control dir-select"
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          aria-label="Filter by kind of event"
        >
          <option value="all">Any kind</option>
          {tiers.map((t) => (
            <option key={t} value={t}>
              {tierLabel(t)}
            </option>
          ))}
        </select>
      </div>

      <p className="dir-count muted">
        {filtered.length.toLocaleString('en-US')} of {total.toLocaleString('en-US')} tournaments
        {!everything && recentFrom ? <> · since {day(recentFrom)}</> : null}
        {!everything && archived > 0 ? (
          <>
            {' · '}
            <button type="button" className="link-btn" onClick={showEverything} disabled={loadingAll}>
              {loadingAll
                ? 'Loading the archive…'
                : `include the earlier ${archived.toLocaleString('en-US')}`}
            </button>
          </>
        ) : null}
      </p>

      {filtered.length === 0 ? (
        <p className="empty">No tournament matches that.</p>
      ) : (
        <div className="table-scroll">
          <table className="meta-table dir-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Tournament</th>
                <th>Won by</th>
                <th style={{ textAlign: 'right' }}>Decks</th>
                <th style={{ textAlign: 'right' }}>Entrants</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((event) => (
                <tr key={event.id}>
                  <td className="mono muted dir-date">{day(event.date)}</td>
                  <td>
                    <Link href={`/event/${event.id}`} className="dir-name">
                      {event.name}
                    </Link>
                    <span className="dir-tags">
                      {tierLabel(event.tier)} · {venueLabel(event.venue)} ·{' '}
                      {event.region === 'jp' ? 'Japanese' : 'English'}
                    </span>
                  </td>
                  <td>
                    {event.winner ? (
                      <Link href={`/decks/${event.winner.toLowerCase()}`} className="meta-leader">
                        <img src={art(event.winner, 96)} alt="" loading="lazy" />
                        <span className="meta-leader-name">
                          {leaders[event.winner]?.n ?? event.winner}
                        </span>
                      </Link>
                    ) : (
                      <span className="muted small">Not recorded</span>
                    )}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {event.recorded}
                  </td>
                  <td className="mono muted" style={{ textAlign: 'right' }}>
                    {event.entrants || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > limit ? (
        <p style={{ marginTop: '1rem' }}>
          <button type="button" className="chip chip-link" onClick={() => setLimit(limit + 200)}>
            Show more
          </button>
        </p>
      ) : null}
    </>
  );
}
