'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { art } from '@/lib/art';
import { fold, toPlayer, type PlayerRow, type Region } from '@/lib/directory';
import { loadLeaders, loadPlayerArchive, loadPlayers, type Leaders } from '@/lib/shards';

/**
 * Who has been recorded playing, and how often.
 *
 * The default list is everyone the payload calls a regular, which is a threshold
 * the build sets rather than this file: of 18,960 players, 9,449 appear exactly
 * once and 3,115 exactly twice, so a directory built on "two or more" would be
 * mostly people who turned up and left. Searching a name that is not in it loads
 * the rest, so nobody is unreachable; their own page never depended on this list.
 *
 * "Results" counts decklists and "Events" counts distinct days-plus-events,
 * because one tournament can put two lists on record for the same person and
 * counting those as two tournaments would flatter everyone unevenly.
 */

const SORTS = [
  { id: 'results', label: 'Results', at: 2 },
  { id: 'events', label: 'Events', at: 3 },
  { id: 'top8', label: 'Top 8s', at: 4 },
  { id: 'firsts', label: 'Wins', at: 5 },
] as const;

const REGIONS: { id: Region | 'all'; label: string }[] = [
  { id: 'all', label: 'Both' },
  { id: 'en', label: 'English' },
  { id: 'jp', label: 'Japanese' },
];

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

export default function PlayerBrowser() {
  const [rows, setRows] = useState<PlayerRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [archived, setArchived] = useState(0);
  /* Replaced by whatever the payload says; see DIRECTORY_MIN_RESULTS. */
  const [minResults, setMinResults] = useState(5);
  const [leaders, setLeaders] = useState<Leaders>({});
  const [error, setError] = useState<string | null>(null);

  const [everyone, setEveryone] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [sort, setSort] = useState<(typeof SORTS)[number]['id']>('results');
  const [region, setRegion] = useState<Region | 'all'>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    Promise.all([loadPlayers(), loadLeaders()])
      .then(([index, names]) => {
        setRows(index.players);
        setTotal(index.total);
        setArchived(index.archived);
        setMinResults(index.minResults);
        setLeaders(names);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load.'));
  }, []);

  const showEveryone = async () => {
    setLoadingAll(true);
    try {
      const archive = await loadPlayerArchive();
      setRows((held) => [...(held ?? []), ...archive.players]);
      setEveryone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the rest.');
    } finally {
      setLoadingAll(false);
    }
  };

  const filtered = useMemo(() => {
    const needle = fold(query.trim());
    const at = SORTS.find((s) => s.id === sort)!.at;
    return (rows ?? [])
      .filter(
        (row) =>
          (region === 'all' || row[8] === region || row[8] === 'both') &&
          (!needle || fold(row[1]).includes(needle))
      )
      .sort((a, b) => (b[at] as number) - (a[at] as number) || a[1].localeCompare(b[1]))
      .map(toPlayer);
  }, [rows, region, query, sort]);

  useEffect(() => setLimit(100), [region, query, sort, everyone]);

  if (error) return <p className="empty">The player list did not load ({error}).</p>;
  if (!rows) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="dir-controls">
        <input
          className="control dir-search"
          type="search"
          placeholder="Search by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search players by name"
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
        <span className="chip-row">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="chip"
              aria-pressed={sort === s.id}
              onClick={() => setSort(s.id)}
            >
              {s.label}
            </button>
          ))}
        </span>
      </div>

      <p className="dir-count muted">
        {filtered.length.toLocaleString('en-US')} of {total.toLocaleString('en-US')} players
        {!everyone ? (
          <>
            {' · '}
            {minResults}+ recorded results ·{' '}
            <button type="button" className="link-btn" onClick={showEveryone} disabled={loadingAll}>
              {loadingAll
                ? 'Loading…'
                : `include the ${archived.toLocaleString('en-US')} seen once`}
            </button>
          </>
        ) : null}
      </p>

      {filtered.length === 0 ? (
        <p className="empty">
          Nobody by that name in this list.
          {!everyone ? (
            <>
              {' '}
              <button type="button" className="link-btn" onClick={showEveryone}>
                Search everyone
              </button>
              .
            </>
          ) : null}
        </p>
      ) : (
        <div className="table-scroll">
          <table className="meta-table dir-table">
            <thead>
              <tr>
                <th />
                <th>Player</th>
                <th>Most played</th>
                <th style={{ textAlign: 'right' }}>Results</th>
                <th style={{ textAlign: 'right' }}>Events</th>
                <th style={{ textAlign: 'right' }}>Top 8</th>
                <th style={{ textAlign: 'right' }}>Wins</th>
                <th style={{ textAlign: 'right' }}>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((player, i) => (
                <tr key={player.slug}>
                  <td className="meta-rank">{i + 1}</td>
                  <td>
                    <Link href={`/player/${player.slug}`} className="dir-name">
                      {player.name}
                    </Link>
                    <span className="dir-tags">
                      {player.regions === 'both'
                        ? 'English and Japanese'
                        : player.regions === 'jp'
                          ? 'Japanese'
                          : 'English'}
                    </span>
                  </td>
                  <td>
                    <Link href={`/decks/${player.main.toLowerCase()}`} className="meta-leader">
                      <img src={art(player.main, 96)} alt="" loading="lazy" />
                      <span className="meta-leader-name">
                        {leaders[player.main]?.n ?? player.main}
                      </span>
                    </Link>
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {player.results}
                  </td>
                  <td className="mono muted" style={{ textAlign: 'right' }}>
                    {player.events}
                  </td>
                  <td className="mono muted" style={{ textAlign: 'right' }}>
                    {player.top8 || '—'}
                  </td>
                  <td className="mono muted" style={{ textAlign: 'right' }}>
                    {player.firsts || '—'}
                  </td>
                  <td className="mono muted dir-date" style={{ textAlign: 'right' }}>
                    {day(player.last)}
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
