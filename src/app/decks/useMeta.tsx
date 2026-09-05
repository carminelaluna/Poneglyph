'use client';

import { useEffect, useMemo, useState } from 'react';
import { dataUrl } from '@/lib/paths';
import {
  archiveMonthsFor,
  DAY_WINDOWS,
  VENUES,
  type MetaDeck,
  windowLabel,
  windowEnd,
  windowStart,
  type MetaIndex,
  type Venue,
  type Window,
} from '@/lib/meta';

/**
 * The deck corpus, fetched once and shared by every metagame view. It is a static
 * file rather than an API call, so the browser caches it and switching between the
 * table and an archetype costs nothing.
 */
export type Region = 'en' | 'jp';

/** The two regions a player actually thinks in. */
export const REGIONS: { id: Region; label: string; blurb: string; file: string }[] = [
  {
    id: 'en',
    label: 'English',
    blurb: 'Limitless tournaments and Top Decks results, back to 2022',
    file: 'decks-en',
  },
  {
    id: 'jp',
    label: 'Japanese',
    blurb: 'Japanese shop and regional results, back to 2022',
    file: 'decks-jp',
  },
];

const fileFor = (region: Region) => REGIONS.find((r) => r.id === region)?.file ?? 'decks-en';

/**
 * The two regions are separate corpora, not a filter over one. They cover different
 * scenes with different card pools and different event structures, so switching
 * region swaps the whole dataset rather than narrowing it.
 */
/**
 * The corpus for a region, in two parts.
 *
 * The first payload carries the last 90 days, which answers every window the page
 * offers by default. Anything older reaches into the archive, which is a file per
 * month: a window is a date range, so it fetches the months it covers and leaves
 * the rest alone.
 *
 * It was one file until the Limitless backfill, when the English archive went from
 * 253 KB gzipped to 1.1 MB. That is the whole cost of the split: before the
 * backfill, an old era was thin and "All" was the only real reason to want the
 * archive; after it, an old era is the interesting thing on the page and was
 * costing 1.1 MB to read three months of 2024. Now it costs one to three files of
 * about 21 KB. "All" still fetches everything, which is what all costs — but in
 * parallel, and each month is cached on its own.
 */
export function useMetaIndex(region: Region = 'en', window_?: Window) {
  const [index, setIndex] = useState<MetaIndex | null>(null);
  /* Keyed `region:YYYY-MM`, so switching region cannot read another one's decks. */
  const [archive, setArchive] = useState<Record<string, MetaDeck[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIndex(null);
    setError(null);
    fetch(dataUrl(`${fileFor(region)}-index.json`))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: MetaIndex) => {
        if (!cancelled) setIndex(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [region]);

  /* The months this window reaches into, and nothing beyond them. */
  const wanted = useMemo(
    () => (index && window_ ? archiveMonthsFor(window_, index) : []),
    [index, window_]
  );
  /* A stable dependency: the array is rebuilt every render, its contents are not. */
  const wantedKey = wanted.join(',');

  useEffect(() => {
    const missing = wanted.filter((m) => !(`${region}:${m}` in archive));
    if (missing.length === 0) return;

    let cancelled = false;

    for (const month of missing) {
      const key = `${region}:${month}`;
      fetch(dataUrl(`${fileFor(region)}-archive/${month}.json`))
        .then((res) => (res.ok ? res.json() : { decks: [] }))
        .then((data: { decks?: MetaDeck[] }) => {
          /*
           * A failed month is stored as an empty list rather than left absent, so a
           * blip does not become an endless retry every time this effect re-runs.
           */
          if (!cancelled) setArchive((prev) => ({ ...prev, [key]: data.decks ?? [] }));
        })
        .catch(() => {
          if (!cancelled) setArchive((prev) => ({ ...prev, [key]: [] }));
        });
    }

    return () => {
      cancelled = true;
    };
    /* `archive` is read, not depended on: adding it would re-run on every arrival. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, wantedKey]);

  /* One object either way, so nothing downstream knows the corpus arrived in parts. */
  const merged = useMemo(() => {
    if (!index) return null;
    const older = wanted.flatMap((m) => archive[`${region}:${m}`] ?? []);
    if (older.length === 0) return index;
    return { ...index, decks: [...index.decks, ...older] };
  }, [index, archive, region, wanted]);

  /*
   * "Loading" is whether a month this window needs has not arrived, not whether a
   * request is in flight: months already held are shown at once, and a second
   * window over the same months waits for nothing. A month that failed is held as
   * an empty list, so it counts as arrived and the spinner cannot stick.
   */
  const loadingArchive = wanted.some((m) => !(`${region}:${m}` in archive));

  return { index: merged, error, loadingArchive };
}

/** The window a page opens on, and so the one value the query string omits. */
const DEFAULT_DAYS = 30;
const DEFAULT: Window = { kind: 'days', days: DEFAULT_DAYS };

/**
 * The chosen view, written as a query string.
 *
 * Extracted from the effect below because it now has a second caller: the links
 * out to the full matchup and decklist tables, which are separate pages and would
 * otherwise land there showing the last 30 days however far back you had set the
 * window. Two copies of this encoding would be two answers to "what is this page
 * showing", and the reader would meet the disagreement rather than the bug.
 *
 * `base` keeps any parameter this does not own — the five it does are cleared
 * first, so a re-encode replaces rather than appends.
 */
export function windowQuery(
  window_: Window,
  venues: Venue[],
  tiers: string[],
  region: Region,
  base?: URLSearchParams
): string {
  const params = new URLSearchParams(base);
  for (const key of ['days', 'era', 'play', 'tier', 'region']) params.delete(key);

  if (window_.kind === 'era') params.set('era', window_.set);
  else if (window_.kind === 'all') params.set('days', 'all');
  else if (window_.days !== DEFAULT_DAYS) params.set('days', String(window_.days));
  for (const v of venues) params.append('play', v);
  for (const t of tiers) params.append('tier', t);
  if (region !== 'en') params.set('region', region);

  return params.toString();
}

/** The same, as a suffix ready to concatenate onto a path. */
export const windowHref = (path: string, qs: string) => (qs ? `${path}?${qs}` : path);

/**
 * The chosen window, kept in the address bar so a view can be linked to and so it
 * survives moving between the table and an archetype page. Written with the History
 * API rather than the router — the page already holds every deck, so a navigation
 * would fetch a server render for a result it can compute itself.
 */
export function useWindow(): {
  window: Window;
  setWindow: (w: Window) => void;
  venues: Venue[];
  setVenues: (v: Venue[]) => void;
  tiers: string[];
  setTiers: (t: string[]) => void;
  region: Region;
  setRegion: (r: Region) => void;
  /** This view as a query string, for linking to a page that shows the same one. */
  query: string;
  /**
   * The same state, named the way `WindowBar` wants it, so a caller spreads it
   * rather than restating ten props. Four views render that bar and all four had
   * written the list out; the tenth prop added to it would have been added four
   * times, or three.
   */
  bar: WindowBarControls;
} {
  const [window_, setWindow] = useState<Window>(DEFAULT);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [tiers, setTiers] = useState<string[]>([]);
  const [region, setRegion] = useState<Region>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(globalThis.location.search);
    const days = params.get('days');
    const era = params.get('era');
    if (era) setWindow({ kind: 'era', set: era });
    else if (days === 'all') setWindow({ kind: 'all' });
    else if (days && Number(days) > 0) setWindow({ kind: 'days', days: Number(days) });

    const play = params.getAll('play').filter((v): v is Venue =>
      VENUES.some((x) => x.id === v)
    );
    if (play.length) setVenues(play);
    const tier = params.getAll('tier');
    if (tier.length) setTiers(tier);
    const r = params.get('region');
    if (r && REGIONS.some((x) => x.id === r)) setRegion(r as Region);
    setReady(true);
  }, []);

  /*
   * The same encoding the "see all" links carry, so following one lands on the
   * window that was being read rather than back on the default thirty days.
   */
  const query = windowQuery(window_, venues, tiers, region);

  useEffect(() => {
    if (!ready) return;
    const qs = windowQuery(
      window_,
      venues,
      tiers,
      region,
      new URLSearchParams(globalThis.location.search)
    );
    globalThis.history.replaceState(null, '', qs ? `?${qs}` : globalThis.location.pathname);
  }, [ready, window_, venues, tiers, region]);

  /* Region-specific filters do not carry across; the vocabularies differ. */
  const changeRegion = (r: Region) => {
    setRegion(r);
    setVenues([]);
    setTiers([]);
  };

  return {
    window: window_,
    setWindow,
    venues,
    setVenues,
    tiers,
    setTiers,
    region,
    setRegion: changeRegion,
    query,
    bar: {
      window: window_,
      onChange: setWindow,
      venues,
      onVenues: setVenues,
      tiers,
      onTiers: setTiers,
      region,
      onRegion: changeRegion,
    },
  };
}

/** The controls half of the bar — what `useWindow` hands back as `bar`. */
export type WindowBarControls = {
  window: Window;
  onChange: (w: Window) => void;
  venues: Venue[];
  onVenues: (v: Venue[]) => void;
  tiers: string[];
  onTiers: (t: string[]) => void;
  region: Region;
  onRegion: (r: Region) => void;
};

/**
 * The archive did not load, said once.
 *
 * Four views fetch this index and all four carried the same paragraph, naming the
 * same command. A message telling somebody how to fix their checkout is exactly the
 * kind that should not exist in four slightly different versions.
 */
export function IndexError({ error }: { error: string }) {
  return (
    <p className="empty">
      The deck index did not load ({error}). Run{' '}
      <code className="mono">npm run ingest:decks</code> to build it.
    </p>
  );
}

export function WindowBar({
  window: window_,
  onChange,
  venues,
  onVenues,
  tiers,
  onTiers,
  region,
  onRegion,
  index,
  count,
  noun = 'decks',
}: WindowBarControls & {
  index: MetaIndex;
  count: number;
  noun?: string;
}) {
  const from = windowStart(window_, index);
  /* An era stops when the next set arrived; everything else runs to the newest. */
  const to = windowEnd(window_, index);

  return (
    <div className="window-bar">
      <div className="window-chips" role="group" aria-label="Region">
        {REGIONS.map((r) => (
          <button
            key={r.id}
            type="button"
            className="window-chip"
            aria-pressed={region === r.id}
            title={r.blurb}
            onClick={() => onRegion(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="window-chips" role="group" aria-label="Time window">
        {DAY_WINDOWS.map((days) => (
          <button
            key={days}
            type="button"
            className="window-chip"
            aria-pressed={window_.kind === 'days' && window_.days === days}
            onClick={() => onChange({ kind: 'days', days })}
          >
            {days}d
          </button>
        ))}
        <button
          type="button"
          className="window-chip"
          aria-pressed={window_.kind === 'all'}
          onClick={() => onChange({ kind: 'all' })}
        >
          All
        </button>
      </div>

      {index.eras.length > 0 ? (
        <label className="window-era">
          <span className="eyebrow">Since release</span>
          <select
            className="control"
            value={window_.kind === 'era' ? window_.set : ''}
            onChange={(e) =>
              e.target.value ? onChange({ kind: 'era', set: e.target.value }) : onChange(DEFAULT)
            }
          >
            <option value="">Choose a release…</option>
            {/*
              One list in release order. Grouping expansions and starter decks into
              separate optgroups put a 2022 booster above a 2026 starter deck, which
              is not how anyone reads a release timeline.
            */}
            {index.eras.map((era) => (
              <option key={era.set} value={era.set}>
                {era.from} · {era.code}
                {era.kind === 'Starter deck' ? ' (starter)' : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {new Set(index.decks.map((d) => d.v)).size > 1 ? (
      <div className="window-chips" role="group" aria-label="Where the event was played">
        <button
          type="button"
          className="window-chip"
          aria-pressed={venues.length === 0}
          onClick={() => onVenues([])}
          title="Every recorded event"
        >
          All play
        </button>
        {VENUES.map((v) => (
          <button
            key={v.id}
            type="button"
            className="window-chip"
            aria-pressed={venues.includes(v.id)}
            title={v.blurb}
            onClick={() =>
              onVenues(
                venues.includes(v.id) ? venues.filter((x) => x !== v.id) : [...venues, v.id]
              )
            }
          >
            {v.label}
          </button>
        ))}
      </div>
      ) : null}

      <label className="window-era">
        <span className="eyebrow">Event</span>
        <select
          className="control"
          value={tiers[0] ?? ''}
          onChange={(e) => onTiers(e.target.value ? [e.target.value] : [])}
        >
          <option value="">Every event type</option>
          {(index.tiers ?? []).map((t) => {
            const n = index.decks.filter((d) => d.k === t.id).length;
            return (
              <option key={t.id} value={t.id} disabled={n === 0}>
                {t.label}
                {n === 0 ? ' — none yet' : ` (${n} decks)`}
              </option>
            );
          })}
        </select>
      </label>

      <span className="window-summary">
        <b className="mono">{count.toLocaleString('en-US')}</b> {noun} ·{' '}
        {windowLabel(window_, index)}
        {from ? (
          <span className="muted">
            {' '}
            · {from} to {to ?? index.window.to ?? 'now'}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function Trend({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="muted">—</span>;
  if (Math.abs(delta) < 0.15) return <span className="muted mono">=</span>;
  const up = delta > 0;
  return (
    <span className={`wr mono ${up ? 'wr-up' : 'wr-down'}`}>
      {up ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}
    </span>
  );
}

export function WinRate({ value, sample }: { value: number | null; sample?: number }) {
  if (value === null || sample === 0) return <span className="muted">—</span>;
  const cls = value >= 52 ? 'wr wr-up' : value < 48 ? 'wr wr-down' : 'wr';
  return (
    <span className={cls} title={sample ? `from ${sample} whole-field decks` : undefined}>
      {value.toFixed(1)}%
      {sample ? <span className="wr-sample"> /{sample}</span> : null}
    </span>
  );
}
