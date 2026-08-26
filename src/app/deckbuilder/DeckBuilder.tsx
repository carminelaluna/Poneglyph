'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import DeckExport from '@/components/DeckExport';
import Pips from '@/components/Pips';
import { art } from '@/lib/art';
import {
  DECK_SIZE,
  MAX_COPIES,
  type Banlist,
  type Counted,
  type DeckCard,
  type Leader,
  colorsMatch,
  decodeDeck,
  encodeDeck,
  totalCards,
  validate,
} from '@/lib/deck-rules';
import { dataUrl } from '@/lib/paths';

/**
 * Build a deck.
 *
 * Everything happens in the page: the card index is the same 176 KB file the search
 * already downloads, the rules are in lib/deck-rules.ts, and there is nowhere to
 * save to — this site has no server and no accounts.
 *
 * So a deck lives in two places. The address bar holds it, which makes every deck a
 * link you can paste to someone; and localStorage holds the last one, so closing the
 * tab does not throw the work away. Neither is an account, and the page says so.
 */

type Row = {
  i: string; n: string; c: string[]; y: string; o: number | null; l: number | null;
  p: number | null; u: number | null; t: string[]; r: string; s: string;
  q: string; f: 0 | 1;
};

const STORAGE_KEY = 'poneglyph:deck';

const toCard = (row: Row): DeckCard => ({
  id: row.i,
  name: row.n,
  colors: row.c,
  category: row.y,
  standard: row.f,
});

/** Character, Event, Stage — the order the decklist pages use. */
const ORDER = ['Character', 'Event', 'Stage'];

export default function DeckBuilder() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [banlist, setBanlist] = useState<Banlist>({ banned: [], restricted: [], pairs: [] });
  const [error, setError] = useState<string | null>(null);

  const [leaderId, setLeaderId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [format, setFormat] = useState<'Standard' | 'Extra'>('Standard');
  const [query, setQuery] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(dataUrl('cards-index.json')).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      /* The banlist is small and optional — a builder without it still works. */
      fetch(dataUrl('banlist.json'))
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([index, bans]) => {
        if (cancelled) return;
        setRows(index as Row[]);
        if (bans) setBanlist(bans as Banlist);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Restore from the URL first, then from the last session. */
  useEffect(() => {
    const fromUrl = new URLSearchParams(globalThis.location.search).get('d');
    const saved = fromUrl || globalThis.localStorage?.getItem(STORAGE_KEY) || '';
    const { leaderId: id, counts: held } = decodeDeck(saved);
    if (id) setLeaderId(id);
    if (held.size) setCounts(held);
    setReady(true);
  }, []);

  /*
   * Encoded from the ids alone, deliberately not from the loaded cards.
   *
   * Looking each id up in the card index made this depend on a fetch: on the first
   * render after a reload the index was still in flight, so this produced the empty
   * string, the effect below wrote that to the URL and to localStorage, and the deck
   * that had just been restored was erased before anyone saw it.
   */
  const encoded = useMemo(() => encodeDeck(leaderId, counts), [leaderId, counts]);

  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(globalThis.location.search);
    if (encoded) params.set('d', encoded);
    else params.delete('d');
    const qs = params.toString();
    globalThis.history.replaceState(null, '', qs ? `?${qs}` : globalThis.location.pathname);
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, encoded);
    } catch {
      /* Private browsing refuses to store. Not a reason to break the builder. */
    }
  }, [ready, encoded]);

  const byId = useMemo(() => {
    const map = new Map<string, Row>();
    for (const row of rows ?? []) map.set(row.i, row);
    return map;
  }, [rows]);

  const leaderRow = leaderId ? byId.get(leaderId) : undefined;
  const leader: Leader | null = leaderRow
    ? { ...toCard(leaderRow), life: leaderRow.l }
    : null;

  const deck: Counted[] = useMemo(
    () =>
      [...counts.entries()]
        .map(([id, count]) => {
          const row = byId.get(id);
          return row ? { card: toCard(row), count } : null;
        })
        .filter(Boolean) as Counted[],
    [counts, byId]
  );

  const total = totalCards(deck);
  const problems = useMemo(
    () => (ready && rows ? validate(leader, deck, banlist, format) : []),
    [ready, rows, leader, deck, banlist, format]
  );

  const add = useCallback((id: string, by: number) => {
    setCounts((prev) => {
      const next = new Map(prev);
      const value = (next.get(id) ?? 0) + by;
      if (value <= 0) next.delete(id);
      else next.set(id, Math.min(value, MAX_COPIES));
      return next;
    });
  }, []);

  /* The pool: everything this Leader could legally play, minus Leaders themselves. */
  const pool = useMemo(() => {
    if (!rows || !leader) return [];
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => row.y !== 'Leader')
      .filter((row) => (format === 'Standard' ? row.f === 1 : true))
      .filter((row) => colorsMatch(leader, toCard(row)))
      .filter((row) => !needle || row.q.includes(needle))
      .sort((a, b) => (a.o ?? 99) - (b.o ?? 99) || a.n.localeCompare(b.n))
      .slice(0, 240);
  }, [rows, leader, format, query]);

  const leaders = useMemo(() => {
    if (!rows) return [];
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => row.y === 'Leader')
      .filter((row) => (format === 'Standard' ? row.f === 1 : true))
      .filter((row) => !needle || row.q.includes(needle))
      .sort((a, b) => a.n.localeCompare(b.n));
  }, [rows, format, query]);

  const grouped = useMemo(
    () =>
      ORDER.map((category) => ({
        category,
        entries: deck
          .filter((entry) => entry.card.category === category)
          .sort((a, b) => {
            const ao = byId.get(a.card.id)?.o ?? 99;
            const bo = byId.get(b.card.id)?.o ?? 99;
            return ao - bo || a.card.name.localeCompare(b.card.name);
          }),
      })).filter((group) => group.entries.length > 0),
    [deck, byId]
  );

  if (error) {
    return (
      <p className="empty">
        The card archive did not load ({error}). Reload the page to try again.
      </p>
    );
  }

  if (!rows) return <p className="muted">Loading the card archive…</p>;

  const errors = problems.filter((p) => p.kind === 'error');
  const warnings = problems.filter((p) => p.kind === 'warning');

  return (
    <div className="build">
      <div className="build-pool">
        <div className="build-controls">
          <input
            type="search"
            className="control build-search"
            placeholder={leader ? 'Search this Leader’s card pool…' : 'Search Leaders…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={leader ? 'Search the card pool' : 'Search Leaders'}
          />
          <div className="window-chips" role="group" aria-label="Format">
            {(['Standard', 'Extra'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className="window-chip"
                aria-pressed={format === f}
                onClick={() => setFormat(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {!leader ? (
          <>
            <p className="muted" style={{ fontSize: '0.8rem', margin: '0 0 0.8rem' }}>
              {leaders.length} Leaders. Picking one sets the colours everything else has to
              match.
            </p>
            <div className="build-grid">
              {leaders.slice(0, 120).map((row) => (
                <button
                  key={row.i}
                  type="button"
                  className="build-tile"
                  onClick={() => {
                    setLeaderId(row.i);
                    setQuery('');
                  }}
                  title={`${row.n} — ${row.c.join('/')}`}
                >
                  <img src={art(row.i, 320)} alt={row.n} loading="lazy" />
                  <span className="build-tile-name">{row.n}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="muted" style={{ fontSize: '0.8rem', margin: '0 0 0.8rem' }}>
              {pool.length === 240 ? '240+ ' : `${pool.length} `}
              cards {leader.colors.join('/')} can play. Click to add, right-click to remove.
            </p>
            <div className="build-grid">
              {pool.map((row) => {
                const held = counts.get(row.i) ?? 0;
                return (
                  <button
                    key={row.i}
                    type="button"
                    className={`build-tile${held ? ' build-tile-held' : ''}`}
                    onClick={() => add(row.i, 1)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      add(row.i, -1);
                    }}
                    title={`${row.n} — cost ${row.o ?? '—'}`}
                  >
                    <img src={art(row.i, 320)} alt={row.n} loading="lazy" />
                    {held > 0 ? <span className="build-count">{held}</span> : null}
                    <span className="build-tile-name">{row.n}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <aside className="build-deck">
        <div className="build-summary slab slab-pad">
          {leader ? (
            <>
              <div className="build-leader">
                <img src={art(leader.id, 320)} alt={leader.name} />
                <div style={{ minWidth: 0 }}>
                  <b>{leader.name}</b>
                  <span className="build-leader-meta">
                    <Pips colors={leader.colors} />
                    {leader.colors.join(' / ')}
                  </span>
                  <button
                    type="button"
                    className="build-change"
                    onClick={() => {
                      setLeaderId(null);
                      setCounts(new Map());
                      setQuery('');
                    }}
                  >
                    Change Leader
                  </button>
                </div>
              </div>

              <p className={`build-total${total === DECK_SIZE ? ' build-total-ok' : ''}`}>
                <b className="mono">{total}</b>
                <span className="muted"> / {DECK_SIZE}</span>
              </p>
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              No Leader yet. Pick one on the left.
            </p>
          )}
        </div>

        {errors.length > 0 || warnings.length > 0 ? (
          <ul className="build-problems">
            {errors.map((p, i) => (
              <li key={`e${i}`} className="build-error">
                {p.message}
              </li>
            ))}
            {warnings.map((p, i) => (
              <li key={`w${i}`} className="build-warning">
                {p.message}
              </li>
            ))}
          </ul>
        ) : leader ? (
          <p className="build-legal">Legal in {format}.</p>
        ) : null}

        {grouped.map((group) => (
          <div key={group.category} className="build-group">
            <h3>
              {group.category}{' '}
              <span className="muted mono">
                {group.entries.reduce((n, e) => n + e.count, 0)}
              </span>
            </h3>
            <ul>
              {group.entries.map(({ card, count }) => (
                <li key={card.id}>
                  <button
                    type="button"
                    className="build-step"
                    onClick={() => add(card.id, -1)}
                    aria-label={`Remove one ${card.name}`}
                  >
                    −
                  </button>
                  <span className="mono build-copies">{count}</span>
                  <Link href={`/cards/${card.id.toLowerCase()}`} className="build-card-name">
                    {card.name}
                  </Link>
                  <span className="mono muted build-cost">{byId.get(card.id)?.o ?? '—'}</span>
                  <button
                    type="button"
                    className="build-step"
                    onClick={() => add(card.id, 1)}
                    disabled={count >= MAX_COPIES}
                    aria-label={`Add one ${card.name}`}
                  >
                    +
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {leader && total > 0 ? (
          <DeckExport
            leaderId={leader.id}
            cards={deck.map((entry) => ({ id: entry.card.id, count: entry.count }))}
            names={Object.fromEntries([
              [leader.id, leader.name],
              ...deck.map((entry) => [entry.card.id, entry.card.name] as const),
            ])}
            filename={`${leader.id}-${leader.name}`}
          />
        ) : null}
      </aside>
    </div>
  );
}
