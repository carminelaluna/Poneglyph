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
  parseDeckList,
  totalCards,
  validate,
} from '@/lib/deck-rules';
import { dataUrl } from '@/lib/paths';
import { getDeck, saveDeck, useAccount } from '@/lib/useAccount';

/**
 * Build a deck.
 *
 * Everything happens in the page: the card index is the same 176 KB file the search
 * already downloads, the rules are in lib/deck-rules.ts, and there is nowhere to
 * save to — this site has no server and no accounts.
 *
 * And nothing is kept between visits. Reloading gives an empty deck; the way to keep
 * one is to copy it out for the simulator. See the note by the state below.
 */

type Row = {
  i: string; n: string; c: string[]; y: string; o: number | null; l: number | null;
  p: number | null; u: number | null; t: string[]; r: string; s: string;
  q: string; f: 0 | 1;
  /** Lowest listed price, when the price source has one for this card. */
  $: number | null;
};

const toCard = (row: Row): DeckCard => ({
  id: row.i,
  name: row.n,
  colors: row.c,
  category: row.y,
  standard: row.f,
});

/** Character, Event, Stage — the order the decklist pages use. */
const ORDER = ['Character', 'Event', 'Stage'];

/** Everything from 10 up shares the last column; the curve is flat past it. */
const TOP_COST = 10;

type DeckStats = {
  curve: { cost: number; copies: number }[];
  peak: number;
  averageCost: number;
  counters: number;
  counterPower: number;
  /** Lowest listed price for one of each card, the Leader included. */
  price: number;
  /** Copies the price source has no figure for — named rather than folded in. */
  unpriced: number;
};

/**
 * What the fifty cards add up to.
 *
 * All of it is arithmetic on the card index the page has already downloaded, so
 * none of this costs a request. The two numbers worth explaining:
 *
 * **Counter** is the total counter power in the deck, which is the figure people
 * compare builds by — a deck holding 34 counters at 2000 plays differently from one
 * holding 34 at 1000, and the count alone does not say which it is.
 *
 * **Price** is the *lowest listed* price, summed over every copy, and it names how
 * many copies it could not price rather than quietly leaving them out. A total that
 * silently skipped a third of the deck would be worse than no total.
 */
function deckStats(deck: Counted[], byId: Map<string, Row>, leader: Row | undefined): DeckStats {
  const curve = new Map<number, number>();
  let counters = 0;
  let counterPower = 0;
  let price = leader?.$ ?? 0;
  let unpriced = leader && leader.$ === null ? 1 : 0;
  let costTotal = 0;
  let costed = 0;

  for (const { card, count } of deck) {
    const row = byId.get(card.id);
    if (!row) continue;

    if (row.o !== null) {
      const bucket = Math.min(row.o, TOP_COST);
      curve.set(bucket, (curve.get(bucket) ?? 0) + count);
      costTotal += row.o * count;
      costed += count;
    }
    if (row.u) {
      counters += count;
      counterPower += row.u * count;
    }
    if (row.$ === null) unpriced += count;
    else price += row.$ * count;
  }

  const bars: { cost: number; copies: number }[] = [];
  for (let cost = 0; cost <= TOP_COST; cost++) bars.push({ cost, copies: curve.get(cost) ?? 0 });
  /* Trim the empty tail so a deck topping out at 7 does not draw three empty columns. */
  while (bars.length > 1 && bars[bars.length - 1].copies === 0) bars.pop();

  return {
    curve: bars,
    peak: Math.max(1, ...bars.map((b) => b.copies)),
    averageCost: costed ? costTotal / costed : 0,
    counters,
    counterPower,
    price,
    unpriced,
  };
}

/**
 * The curve as a sentence, for anyone not reading it as a picture.
 *
 * A row of bars with no text alternative is invisible to a screen reader and says
 * nothing at all to it; the same numbers read aloud are perfectly usable.
 */
const curveLabel = (stats: DeckStats) =>
  'Cost curve: ' +
  stats.curve
    .filter((bar) => bar.copies > 0)
    .map((bar) => `${bar.copies} at cost ${bar.cost === TOP_COST ? `${TOP_COST} or more` : bar.cost}`)
    .join(', ');

export default function DeckBuilder() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [banlist, setBanlist] = useState<Banlist>({ banned: [], restricted: [], pairs: [] });
  const [error, setError] = useState<string | null>(null);

  const [leaderId, setLeaderId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [format, setFormat] = useState<'Standard' | 'Extra'>('Standard');
  const [query, setQuery] = useState('');

  /* Saving. `savedId` is set when this deck came from — or has been written to —
     an account, so Save updates that row instead of leaving a trail of copies. */
  const { signedIn, userId } = useAccount();
  const [savedId, setSavedId] = useState<string | null>(null);
  const [deckName, setDeckName] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  /* Importing a pasted list. */
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importNote, setImportNote] = useState<string | null>(null);

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

  /*
   * `?deck=<id>` opens a saved deck. Not a contradiction of the paragraph below:
   * that is about not restoring work you did not ask to keep. Reloading this URL
   * reopens the *saved* version and throws away unsaved edits, which is what
   * "reload starts over" should mean once a deck has somewhere to live.
   */
  useEffect(() => {
    if (!signedIn) return;
    const id = new URLSearchParams(globalThis.location.search).get('deck');
    if (!id) return;
    let cancelled = false;
    getDeck(id)
      .then((deck) => {
        if (cancelled || !deck) return;
        setSavedId(deck.id);
        setDeckName(deck.name);
        setFormat(deck.format);
        setLeaderId(deck.leader_id);
        setCounts(new Map(deck.cards.map((c) => [c.id, c.count])));
      })
      .catch(() => {
        /* Someone else's deck, or a deleted one. An empty builder is the honest
           result — the row-level policy is what returned nothing. */
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  /*
   * Nothing else is kept. Reloading without `?deck=` starts an empty deck, on
   * purpose.
   *
   * An earlier version wrote the deck into the address bar and into localStorage, so
   * a refresh brought it back. That is the wrong default for a scratchpad: it makes
   * "start over" the awkward operation, and it means a deck you abandoned weeks ago
   * is what greets you. The way to keep a deck is to copy it out.
   *
   * That version left a key behind in the browsers of everyone who opened it, and
   * nothing reads it now. Clearing it here is tidying up after ourselves rather than
   * leaving dead data on someone's machine indefinitely.
   */
  useEffect(() => {
    try {
      globalThis.localStorage?.removeItem('poneglyph:deck');
    } catch {
      /* Private browsing refuses even to remove. Nothing to do about it. */
    }
  }, []);

  const byId = useMemo(() => {
    const map = new Map<string, Row>();
    for (const row of rows ?? []) map.set(row.i, row);
    return map;
  }, [rows]);

  const leaderRow: Row | undefined = leaderId ? byId.get(leaderId) : undefined;
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
    () => (rows ? validate(leader, deck, banlist, format) : []),
    [rows, leader, deck, banlist, format]
  );

  /**
   * Open the import box, with the clipboard already in it where that is allowed.
   *
   * A textarea rather than reading the clipboard straight into the deck.
   * `navigator.clipboard.readText()` needs a secure context and a permission that
   * Firefox does not grant to pages at all, so a button that only did that would be
   * dead for a share of readers with no way to tell. Ctrl+V into a box always works,
   * and the prefill makes it one click for everyone else.
   */
  const openImport = useCallback(async () => {
    setImportOpen(true);
    setImportNote(null);
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) setImportText(text);
    } catch {
      /* Not permitted here. The box is open; paste into it. */
    }
  }, []);

  /**
   * Read a pasted list into the builder.
   *
   * Counts are taken as written, **not clamped to four**. Importing a list with six
   * copies and quietly trimming it to four would hide the very thing the reader
   * needs to see; the validator says so instead, which is what it is for.
   */
  const applyImport = useCallback(() => {
    const parsed = parseDeckList(importText);
    if (parsed.length === 0) {
      setImportNote('Nothing readable in that. Lines look like `4xOP01-025`.');
      return;
    }

    const withRows = parsed.map((c) => ({ ...c, row: byId.get(c.id) }));
    const leaderEntry = withRows.find((c) => c.row?.y === 'Leader');
    if (!leaderEntry) {
      setImportNote('No Leader in that list — add the Leader line and try again.');
      return;
    }

    setLeaderId(leaderEntry.id);
    setCounts(
      new Map(withRows.filter((c) => c !== leaderEntry).map((c) => [c.id, c.count]))
    );
    /* An imported list is a new deck until it is saved deliberately. */
    setSavedId(null);
    setQuery('');
    setImportOpen(false);
    setImportText('');

    const unknown = withRows.filter((c) => !c.row);
    setImportNote(
      unknown.length
        ? `Imported. ${unknown.length} card${unknown.length === 1 ? '' : 's'} not in the archive and left out: ${unknown.map((c) => c.id).join(', ')}.`
        : null
    );
  }, [importText, byId]);

  const save = useCallback(async () => {
    if (!userId || !leaderId) return;
    setSaveState('saving');
    setSaveError(null);
    try {
      const id = await saveDeck({
        id: savedId,
        userId,
        /* A deck with no name is still worth keeping; it gets the Leader's. */
        name: deckName.trim() || leaderRow?.n || 'Untitled deck',
        leaderId,
        cards: [...counts.entries()].map(([cardId, count]) => ({ id: cardId, count })),
        format,
      });
      setSavedId(id);
      setSaveState('saved');
      /* Put the id in the address bar so a reload reopens what was just saved. */
      const params = new URLSearchParams(globalThis.location.search);
      params.set('deck', id);
      globalThis.history.replaceState(null, '', `?${params.toString()}`);
    } catch (err) {
      setSaveState('failed');
      setSaveError(err instanceof Error ? err.message : 'Could not save.');
    }
  }, [userId, leaderId, savedId, deckName, counts, format, leaderRow]);

  /* Say "saved" for a moment, then go back to offering. */
  useEffect(() => {
    if (saveState !== 'saved') return;
    const timer = setTimeout(() => setSaveState('idle'), 2200);
    return () => clearTimeout(timer);
  }, [saveState]);

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

  const stats = useMemo(() => deckStats(deck, byId, leaderRow), [deck, byId, leaderRow]);

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

          <button type="button" className="chip chip-link build-import-open" onClick={openImport}>
            Import a list
          </button>
        </div>

        {importOpen ? (
          <div className="build-import slab slab-pad">
            <label className="eyebrow" htmlFor="build-import">
              Paste a decklist — the format the simulator reads, Leader included
            </label>
            <textarea
              id="build-import"
              className="control build-import-text"
              rows={7}
              placeholder={'1xOP01-001\n4xOP01-025\n…'}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div className="build-import-actions">
              <button type="button" className="chip chip-link" onClick={applyImport}>
                Load it
              </button>
              <button
                type="button"
                className="build-change"
                onClick={() => {
                  setImportOpen(false);
                  setImportText('');
                  setImportNote(null);
                }}
              >
                Cancel
              </button>
              <span className="muted" style={{ fontSize: '0.72rem' }}>
                Replaces what is in the builder now.
              </span>
            </div>
          </div>
        ) : null}

        {importNote ? <p className="build-warning">{importNote}</p> : null}

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

              {total > 0 ? (
                <div className="build-stats">
                  <div className="build-curve" role="img" aria-label={curveLabel(stats)}>
                    {stats.curve.map((bar) => (
                      <span key={bar.cost} className="build-curve-col">
                        <span className="build-curve-count">{bar.copies || ''}</span>
                        <span
                          className="build-curve-bar"
                          style={{ height: `${(bar.copies / stats.peak) * 100}%` }}
                        />
                        <span className="build-curve-cost">
                          {bar.cost === TOP_COST ? `${TOP_COST}+` : bar.cost}
                        </span>
                      </span>
                    ))}
                  </div>

                  <dl className="build-figures">
                    <div>
                      <dt>Average cost</dt>
                      <dd className="mono">{stats.averageCost.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt>Counters</dt>
                      <dd className="mono">
                        {stats.counters}
                        <span className="muted">
                          {' '}
                          / {stats.counterPower.toLocaleString('en-US')}
                        </span>
                      </dd>
                    </div>
                    <div>
                      {/*
                        "Lowest listed", not "value". It is the cheapest printing on
                        the price source, summed over every copy — the number that
                        answers "what would this cost me", and it says outright when
                        it could not price part of the deck.
                      */}
                      <dt>Lowest listed</dt>
                      <dd className="mono">
                        {stats.price > 0 ? `$${stats.price.toFixed(2)}` : '—'}
                        {stats.unpriced ? (
                          <span className="muted"> · {stats.unpriced} unpriced</span>
                        ) : null}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : null}
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
          <>
            {/*
              Saving appears only when there is an account to save to. Showing a
              disabled Save to a signed-out reader would be advertising a feature by
              greying it out, which is the least useful way to mention it.
            */}
            {signedIn ? (
              <div className="build-save">
                <input
                  className="control"
                  type="text"
                  placeholder={leaderRow?.n ?? 'Deck name'}
                  value={deckName}
                  onChange={(e) => setDeckName(e.target.value)}
                  aria-label="Deck name"
                  maxLength={80}
                />
                <button
                  type="button"
                  className="chip chip-link"
                  onClick={save}
                  disabled={saveState === 'saving'}
                >
                  {saveState === 'saving'
                    ? 'Saving…'
                    : saveState === 'saved'
                      ? 'Saved'
                      : savedId
                        ? 'Update'
                        : 'Save to account'}
                </button>
                {saveError ? <p className="build-error">{saveError}</p> : null}
                {savedId ? (
                  <p className="muted" style={{ fontSize: '0.72rem', margin: 0 }}>
                    <Link href="/account">All your decks</Link>
                  </p>
                ) : null}
              </div>
            ) : null}

            <DeckExport
              leaderId={leader.id}
              cards={deck.map((entry) => ({ id: entry.card.id, count: entry.count }))}
            />
          </>
        ) : null}
      </aside>
    </div>
  );
}
