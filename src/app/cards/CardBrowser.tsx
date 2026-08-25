'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { art, artSrcSet } from '@/lib/art';
import Link from 'next/link';
import { pigment } from '@/lib/colors';
import { dataUrl } from '@/lib/paths';
import type { Filters } from '@/lib/cards';

/**
 * One row of the slim browser index (public/data/cards-index.json). Keys are
 * single letters because this file is downloaded by every visitor — the naming
 * is paid for once here and never leaks past `toCard`.
 */
type Row = {
  i: string; n: string; c: string[]; y: string; o: number | null; l: number | null;
  p: number | null; u: number | null; a: string[]; t: string[]; k: string[];
  r: string; s: string; g: string; m: string | null; v: number;
  $: number | null; q: string;
  /** 1 when the card is Standard-legal; 0 when it has rotated to Extra only. */
  f: 0 | 1;
  /** Block number, which is what the rotation actually keys on. */
  b: number | null;
};

/** Every facet, and how a card is matched against it. */
const FACETS = {
  format: { label: 'Format', get: (r: Row) => (r.f ? ['Standard', 'Extra'] : ['Extra']) },
  block: { label: 'Block', get: (r: Row) => (r.b === null ? [] : [String(r.b)]) },
  color: { label: 'Colour', get: (r: Row) => r.c },
  category: { label: 'Type', get: (r: Row) => [r.y] },
  cost: { label: 'Cost', get: (r: Row) => (r.o === null ? [] : [String(r.o)]) },
  life: { label: 'Life', get: (r: Row) => (r.l === null ? [] : [String(r.l)]) },
  power: { label: 'Power', get: (r: Row) => (r.p === null ? [] : [String(r.p)]) },
  counter: { label: 'Counter', get: (r: Row) => (r.u === null ? [] : [String(r.u)]) },
  attribute: { label: 'Attribute', get: (r: Row) => r.a },
  rarity: { label: 'Rarity', get: (r: Row) => [r.r] },
  set: { label: 'Set', get: (r: Row) => [r.s] },
  trait: { label: 'Trait', get: (r: Row) => r.t },
  keyword: { label: 'Keyword', get: (r: Row) => r.k },
} as const;

type FacetKey = keyof typeof FACETS;
type Selection = Record<FacetKey, string[]>;

const EMPTY: Selection = {
  format: [], block: [], color: [], category: [], cost: [], life: [], power: [], counter: [],
  attribute: [], rarity: [], set: [], trait: [], keyword: [],
};

const SORTS = {
  'code-asc': { label: 'Card number', cmp: (a: Row, b: Row) => a.i.localeCompare(b.i, 'en', { numeric: true }) },
  'name-asc': { label: 'Name A–Z', cmp: (a: Row, b: Row) => a.n.localeCompare(b.n) },
  'cost-asc': { label: 'Cost, low first', cmp: (a: Row, b: Row) => nullLast(a.o, b.o, 1) },
  'cost-desc': { label: 'Cost, high first', cmp: (a: Row, b: Row) => nullLast(a.o, b.o, -1) },
  'power-desc': { label: 'Power, high first', cmp: (a: Row, b: Row) => nullLast(a.p, b.p, -1) },
  'power-asc': { label: 'Power, low first', cmp: (a: Row, b: Row) => nullLast(a.p, b.p, 1) },
  'price-desc': { label: 'Price, high first', cmp: (a: Row, b: Row) => nullLast(a.$, b.$, -1) },
  'price-asc': { label: 'Price, low first', cmp: (a: Row, b: Row) => nullLast(a.$, b.$, 1) },
} as const;

type SortKey = keyof typeof SORTS;

/** Cards missing the sorted stat sink to the bottom in both directions. */
function nullLast(a: number | null, b: number | null, dir: 1 | -1) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * dir;
}

const PAGE = 60;

export default function CardBrowser({ facets }: { facets: Filters }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<Selection>(EMPTY);
  const [sort, setSort] = useState<SortKey>('code-asc');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [shown, setShown] = useState(PAGE);
  const [railOpen, setRailOpen] = useState(false);
  const [ready, setReady] = useState(false);

  /*
   * Filters live in the address bar so a search can be linked to, but they are
   * read and written with the History API rather than the router: filtering is
   * entirely client-side, and a router navigation per keystroke would round-trip
   * to the server for a result the page already has.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get('q') ?? '');
    setSelection(fromParams(params));
    const requested = params.get('sort');
    if (requested && requested in SORTS) setSort(requested as SortKey);
    setReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(dataUrl('cards-index.json'))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Row[]) => {
        if (!cancelled) setRows(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const next = new URLSearchParams();
    if (query.trim()) next.set('q', query.trim());
    for (const [key, values] of Object.entries(selection)) {
      for (const v of values) next.append(key, v);
    }
    if (sort !== 'code-asc') next.set('sort', sort);
    const qs = next.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [ready, query, selection, sort]);

  useEffect(() => setShown(PAGE), [query, selection, sort]);

  const toggle = useCallback((facet: FacetKey, value: string) => {
    setSelection((prev) => {
      const current = prev[facet];
      return {
        ...prev,
        [facet]: current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value],
      };
    });
  }, []);

  const clearAll = useCallback(() => {
    setSelection(EMPTY);
    setQuery('');
  }, []);

  const results = useMemo(() => {
    if (!rows) return [];
    const needle = query.trim().toLowerCase();
    const active = (Object.keys(FACETS) as FacetKey[]).filter((k) => selection[k].length > 0);

    const matched = rows.filter((row) => {
      if (needle && !row.q.includes(needle)) return false;
      // Facets are AND across groups, OR within a group.
      for (const key of active) {
        const values = FACETS[key].get(row);
        if (!selection[key].some((v) => values.includes(v))) return false;
      }
      return true;
    });

    return matched.sort(SORTS[sort].cmp);
  }, [rows, query, selection, sort]);

  const activeChips = useMemo(
    () =>
      (Object.keys(FACETS) as FacetKey[]).flatMap((key) =>
        selection[key].map((value) => ({ key, value, label: FACETS[key].label }))
      ),
    [selection]
  );

  const visible = results.slice(0, shown);

  return (
    <div className="shell browse">
      <aside className="rail" data-open={railOpen} aria-label="Filters">
        <div className="rail-head">
          <span className="eyebrow">Filters</span>
          {activeChips.length > 0 || query ? (
            <button type="button" className="link-btn" onClick={clearAll}>
              Clear all
            </button>
          ) : null}
        </div>

        <Group label="Format" open>
          <Options
            items={facets.formats}
            selected={selection.format}
            onToggle={(v) => toggle('format', v)}
          />
          <p className="muted" style={{ fontSize: '0.7rem', margin: '0.5rem 0 0' }}>
            Standard is Block 2 and above. Extra (Grand Battle) allows everything.
          </p>
        </Group>

        <Group label="Block">
          <Keypad
            items={facets.blocks}
            selected={selection.block}
            onToggle={(v) => toggle('block', v)}
          />
        </Group>

        <Group label="Colour" open>
          <div className="swatches">
            {facets.colors.map((c) => (
              <button
                key={c.value}
                type="button"
                className="swatch"
                style={{ '--sw': pigment(String(c.value)) } as React.CSSProperties}
                aria-pressed={selection.color.includes(String(c.value))}
                aria-label={`${c.value} — ${c.count} cards`}
                title={`${c.value} · ${c.count}`}
                onClick={() => toggle('color', String(c.value))}
              />
            ))}
          </div>
        </Group>

        <Group label="Card type" open>
          <Options
            items={facets.categories}
            selected={selection.category}
            onToggle={(v) => toggle('category', v)}
          />
        </Group>

        <Group label="Cost" open>
          <Keypad
            items={facets.costs}
            selected={selection.cost}
            onToggle={(v) => toggle('cost', v)}
          />
        </Group>

        <Group label="Life">
          <Keypad
            items={facets.lives}
            selected={selection.life}
            onToggle={(v) => toggle('life', v)}
            format={(v) => `${v} ♥`}
          />
          <p className="muted" style={{ fontSize: '0.7rem', margin: '0.5rem 0 0' }}>
            Leaders only.
          </p>
        </Group>

        <Group label="Power">
          <Keypad
            items={facets.powers}
            selected={selection.power}
            onToggle={(v) => toggle('power', v)}
            format={(v) => (Number(v) >= 1000 ? `${Number(v) / 1000}k` : v)}
          />
        </Group>

        <Group label="Counter">
          <Keypad
            items={facets.counters}
            selected={selection.counter}
            onToggle={(v) => toggle('counter', v)}
            format={(v) => `+${v}`}
          />
        </Group>

        <Group label="Attribute">
          <Options
            items={facets.attributes}
            selected={selection.attribute}
            onToggle={(v) => toggle('attribute', v)}
          />
        </Group>

        <Group label="Rarity">
          <Options
            items={facets.rarities}
            selected={selection.rarity}
            onToggle={(v) => toggle('rarity', v)}
          />
        </Group>

        <Group label="Keyword">
          <Options
            items={facets.keywords}
            selected={selection.keyword}
            onToggle={(v) => toggle('keyword', v)}
            searchable="Find a keyword"
          />
        </Group>

        <Group label="Trait">
          <Options
            items={facets.types}
            selected={selection.trait}
            onToggle={(v) => toggle('trait', v)}
            searchable="Find a trait"
          />
        </Group>

        <Group label="Set">
          <Options
            items={facets.sets.map((s) => ({ value: s.value, count: s.count, hint: s.name }))}
            selected={selection.set}
            onToggle={(v) => toggle('set', v)}
            searchable="Find a set"
          />
        </Group>
      </aside>

      <div>
        <div className="toolbar">
          <label className="search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search names, card numbers, rules text, traits"
              aria-label="Search cards"
            />
          </label>

          <button
            type="button"
            className="control rail-toggle"
            aria-expanded={railOpen}
            onClick={() => setRailOpen((o) => !o)}
          >
            {railOpen ? 'Hide filters' : 'Filters'}
          </button>

          <select
            className="control"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort by"
          >
            {Object.entries(SORTS).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </select>

          <div className="segmented" role="group" aria-label="View">
            <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
              Grid
            </button>
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
              List
            </button>
          </div>

          <span className="result-count">
            {rows === null
              ? 'Loading…'
              : `${results.length.toLocaleString('en-US')} of ${rows.length.toLocaleString('en-US')}`}
          </span>
        </div>

        {activeChips.length > 0 ? (
          <div className="active-filters">
            {activeChips.map(({ key, value, label }) => (
              <button
                key={`${key}:${value}`}
                type="button"
                className="chip"
                onClick={() => toggle(key, value)}
                aria-label={`Remove filter ${label} ${value}`}
              >
                <b>{label}</b>
                {value}
                <span className="chip-x" aria-hidden="true">
                  ×
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {loadError ? (
          <p className="empty">
            The card index did not load ({loadError}). Reload the page, or run{' '}
            <code className="mono">npm run ingest</code> to rebuild it.
          </p>
        ) : rows === null ? (
          <p className="empty">Reading the archive…</p>
        ) : results.length === 0 ? (
          <div className="empty">
            <p>No card matches these filters.</p>
            <button type="button" className="link-btn" onClick={clearAll}>
              Clear all filters
            </button>
          </div>
        ) : view === 'grid' ? (
          <div className="card-grid">
            {visible.map((row) => (
              <GridTile key={row.i} row={row} />
            ))}
          </div>
        ) : (
          <ListView rows={visible} />
        )}

        {rows !== null && shown < results.length ? (
          <button type="button" className="load-more" onClick={() => setShown((n) => n + PAGE * 2)}>
            Show more — {(results.length - shown).toLocaleString('en-US')} left
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ bits */

function Group({ label, open = false, children }: { label: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="fgroup" open={open}>
      <summary>{label}</summary>
      <div className="fgroup-body">{children}</div>
    </details>
  );
}

type Item = { value: string | number; count: number; hint?: string };

function Options({
  items,
  selected,
  onToggle,
  searchable,
}: {
  items: Item[];
  selected: string[];
  onToggle: (value: string) => void;
  searchable?: string;
}) {
  const [needle, setNeedle] = useState('');
  const filtered = needle
    ? items.filter((i) =>
        `${i.value} ${i.hint ?? ''}`.toLowerCase().includes(needle.toLowerCase())
      )
    : items;

  return (
    <>
      {searchable ? (
        <input
          className="opt-filter"
          type="search"
          value={needle}
          onChange={(e) => setNeedle(e.target.value)}
          placeholder={searchable}
          aria-label={searchable}
        />
      ) : null}
      <div className={searchable || items.length > 8 ? 'opt-scroll' : undefined}>
        {filtered.map((item) => {
          const value = String(item.value);
          return (
            <button
              key={value}
              type="button"
              className="opt"
              aria-pressed={selected.includes(value)}
              onClick={() => onToggle(value)}
            >
              <span className="opt-box" aria-hidden="true" />
              <span className="opt-label" title={item.hint ? `${value} — ${item.hint}` : value}>
                {value}
                {item.hint ? <span className="muted"> · {item.hint}</span> : null}
              </span>
              <span className="opt-count">{item.count}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function Keypad({
  items,
  selected,
  onToggle,
  format = (v: string) => v,
}: {
  items: Item[];
  selected: string[];
  onToggle: (value: string) => void;
  format?: (value: string) => string;
}) {
  return (
    <div className="keypad">
      {items.map((item) => {
        const value = String(item.value);
        return (
          <button
            key={value}
            type="button"
            className="key"
            aria-pressed={selected.includes(value)}
            title={`${item.count} cards`}
            onClick={() => onToggle(value)}
          >
            {format(value)}
          </button>
        );
      })}
    </div>
  );
}

function GridTile({ row }: { row: Row }) {
  return (
    <Link
      href={`/cards/${row.i.toLowerCase()}`}
      className="tile"
      style={{ '--pigment': pigment(row.c[0] ?? '') } as React.CSSProperties}
    >
      <div className="tile-art">
        <img
          src={art(row.i, 320)}
          srcSet={artSrcSet(row.i)}
          sizes="(max-width: 620px) 45vw, 200px"
          alt={`${row.n} (${row.i})`}
          loading="lazy"
          decoding="async"
        />
        {row.v > 1 ? <span className="tile-badge">{row.v} arts</span> : null}
      </div>
      <div className="tile-meta">
        <span className="pips" aria-label={row.c.join(', ')}>
          {row.c.map((c) => (
            <i key={c} className="pip" style={{ '--pip': pigment(c) } as React.CSSProperties} />
          ))}
        </span>
        <span className="tile-name">{row.n}</span>
      </div>
      <div className="tile-meta" style={{ marginTop: '0.1rem' }}>
        <span className="tile-code">{row.i}</span>
        {row.$ !== null ? (
          <span className="tile-price" style={{ marginLeft: 'auto' }}>
            ${row.$.toFixed(2)}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function ListView({ rows }: { rows: Row[] }) {
  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th />
            <th>Card</th>
            <th>Type</th>
            <th>Colour</th>
            <th style={{ textAlign: 'right' }}>Cost</th>
            <th style={{ textAlign: 'right' }}>Power</th>
            <th style={{ textAlign: 'right' }}>Counter</th>
            <th>Attribute</th>
            <th>Set</th>
            <th style={{ textAlign: 'right' }}>Price</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.i}>
              <td>
                <Link href={`/cards/${row.i.toLowerCase()}`}>
                  <img className="row-art" src={art(row.i, 96)} alt="" loading="lazy" />
                </Link>
              </td>
              <td>
                <Link href={`/cards/${row.i.toLowerCase()}`} className="row-name">
                  {row.n}
                </Link>
                <div className="mono" style={{ fontSize: '0.68rem', color: 'var(--glyph-faint)' }}>
                  {row.i} · {row.r}
                </div>
              </td>
              <td className="muted">{row.y}</td>
              <td>
                <span className="pips">
                  {row.c.map((c) => (
                    <i key={c} className="pip" style={{ '--pip': pigment(c) } as React.CSSProperties} />
                  ))}
                </span>
              </td>
              <td className="mono" style={{ textAlign: 'right' }}>
                {row.y === 'Leader' ? `${row.l ?? '—'}♥` : row.o ?? '—'}
              </td>
              <td className="mono" style={{ textAlign: 'right' }}>
                {row.p?.toLocaleString('en-US') ?? '—'}
              </td>
              <td className="mono" style={{ textAlign: 'right' }}>
                {row.u ? `+${row.u}` : '—'}
              </td>
              <td className="muted">{row.a.join(' / ') || '—'}</td>
              <td className="mono muted">{row.s}</td>
              <td className="mono" style={{ textAlign: 'right' }}>
                {row.$ !== null ? `$${row.$.toFixed(2)}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Rebuild the selection from `?color=Red&color=Blue&cost=3` on first render. */
function fromParams(params: URLSearchParams): Selection {
  const out = { ...EMPTY };
  for (const key of Object.keys(FACETS) as FacetKey[]) {
    const values = params.getAll(key);
    if (values.length) out[key] = values;
  }
  return out;
}
