'use client';

import { useEffect, useMemo, useState } from 'react';
import { dataUrl } from '@/lib/paths';
import {
  DAY_WINDOWS,
  VENUES,
  type MetaDeck,
  windowLabel,
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
 * offers by default. Asking for "All" or an era older than that pulls the archive
 * once and merges it in — English whole is three times the size, and most visits
 * are about the last month.
 */
export function useMetaIndex(region: Region = 'en', window_?: Window) {
  const [index, setIndex] = useState<MetaIndex | null>(null);
  const [archive, setArchive] = useState<Record<string, MetaDeck[]>>({});
  const [loadingArchive, setLoadingArchive] = useState(false);
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

  /* Whether the chosen window reaches past what the first payload carries. */
  const wantsArchive = window_ ? needsArchive(window_, index) : false;

  useEffect(() => {
    if (!wantsArchive || archive[region]) return;
    let cancelled = false;
    setLoadingArchive(true);
    fetch(dataUrl(`${fileFor(region)}-archive.json`))
      .then((res) => (res.ok ? res.json() : { decks: [] }))
      .then((data: { decks: MetaDeck[] }) => {
        if (!cancelled) setArchive((prev) => ({ ...prev, [region]: data.decks ?? [] }));
      })
      .catch(() => {
        if (!cancelled) setArchive((prev) => ({ ...prev, [region]: [] }));
      })
      .finally(() => {
        if (!cancelled) setLoadingArchive(false);
      });
    return () => {
      cancelled = true;
    };
  }, [region, wantsArchive, archive]);

  /* One object either way, so nothing downstream knows the corpus arrived in two. */
  const merged = useMemo(() => {
    if (!index) return null;
    const older = wantsArchive ? archive[region] : undefined;
    if (!older || older.length === 0) return index;
    return { ...index, decks: [...index.decks, ...older] };
  }, [index, archive, region, wantsArchive]);

  return { index: merged, error, loadingArchive: loadingArchive && !archive[region] };
}

/** Does this window reach past what the first payload carries? */
function needsArchive(window: Window, index: MetaIndex | null) {
  if (!index?.recentFrom) return false;
  if (window.kind === 'all') return true;
  if (window.kind === 'era') {
    const era = index.eras.find((e) => e.set === window.set);
    return era ? era.from < index.recentFrom : false;
  }
  return windowStart(window, index) !== null && windowStart(window, index)! < index.recentFrom;
}

const DEFAULT: Window = { kind: 'days', days: 30 };

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

  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(globalThis.location.search);
    params.delete('days');
    params.delete('era');
    params.delete('play');
    params.delete('tier');
    params.delete('region');
    if (window_.kind === 'era') params.set('era', window_.set);
    else if (window_.kind === 'all') params.set('days', 'all');
    else if (window_.days !== 30) params.set('days', String(window_.days));
    for (const v of venues) params.append('play', v);
    for (const t of tiers) params.append('tier', t);
    if (region !== 'en') params.set('region', region);
    const qs = params.toString();
    globalThis.history.replaceState(null, '', qs ? `?${qs}` : globalThis.location.pathname);
  }, [ready, window_, venues, tiers, region]);

  /* Region-specific filters do not carry across; the vocabularies differ. */
  const changeRegion = (r: Region) => {
    setRegion(r);
    setVenues([]);
    setTiers([]);
  };

  return { window: window_, setWindow, venues, setVenues, tiers, setTiers, region, setRegion: changeRegion };
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
}: {
  window: Window;
  onChange: (w: Window) => void;
  venues: Venue[];
  onVenues: (v: Venue[]) => void;
  tiers: string[];
  onTiers: (t: string[]) => void;
  region: Region;
  onRegion: (r: Region) => void;
  index: MetaIndex;
  count: number;
  noun?: string;
}) {
  const from = windowStart(window_, index);

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
        {from ? <span className="muted"> · from {from}</span> : null}
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
