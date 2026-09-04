'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * The event list, filtered in the page.
 *
 * All 67 events are already here — filtering is a re-render, not a request. The
 * chosen filters go in the address bar so a view can be linked to, written with the
 * History API rather than the router for the same reason the metagame page does it:
 * a navigation would fetch a page this one can already draw.
 */

export type BrowserEvent = {
  name: string;
  label?: string | null;
  region?: string | null;
  type: string;
  date: string;
  start: string | null;
  venue: string | null;
  link: string | null;
  /** When registration opens, from Bandai's month table. A guideline, not a promise. */
  opens?: string | null;
  /** A note this event carries itself, which is exact where the table is not. */
  registrationNote?: string | null;
};

const WHEN = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
  { id: 'all', label: 'All' },
] as const;

type When = (typeof WHEN)[number]['id'];

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Sunday 26 July" — the weekday matters, since these always land on one. */
function openingLabel(iso: string) {
  const date = new Date(`${iso}T12:00:00Z`);
  return `${dayNames[date.getUTCDay()]} ${date.getUTCDate()} ${date.toLocaleDateString('en-GB', {
    month: 'long',
    timeZone: 'UTC',
  })}`;
}

export default function EventBrowser({
  events,
  times,
}: {
  events: BrowserEvent[];
  times: Record<string, string>;
}) {
  const [region, setRegion] = useState<string>('all');
  const [type, setType] = useState<string>('all');
  const [when, setWhen] = useState<When>('upcoming');
  const [ready, setReady] = useState(false);

  /*
   * Today, read in the browser. The build-time date would be right for a few hours
   * and then quietly start calling tomorrow's events yesterday's — and this is the
   * control people use most, so it has to be true whenever the page is opened.
   */
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    const params = new URLSearchParams(globalThis.location.search);
    const r = params.get('region');
    const t = params.get('type');
    const w = params.get('when');
    if (r) setRegion(r);
    if (t) setType(t);
    if (w && WHEN.some((x) => x.id === w)) setWhen(w as When);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams();
    if (region !== 'all') params.set('region', region);
    if (type !== 'all') params.set('type', type);
    if (when !== 'upcoming') params.set('when', when);
    const qs = params.toString();
    globalThis.history.replaceState(null, '', qs ? `?${qs}` : globalThis.location.pathname);
  }, [ready, region, type, when]);

  const regions = useMemo(
    () => [...new Set(events.map((e) => e.region).filter(Boolean))] as string[],
    [events]
  );
  const types = useMemo(() => [...new Set(events.map((e) => e.type))], [events]);

  const inWhen = (event: BrowserEvent) => {
    if (when === 'all') return true;
    /* An event whose date could not be read is shown rather than hidden. */
    if (!event.start) return true;
    return when === 'past' ? event.start < today : event.start >= today;
  };

  const matching = useMemo(
    () =>
      events.filter(
        (e) =>
          (region === 'all' || e.region === region) &&
          (type === 'all' || e.type === type) &&
          inWhen(e)
      ),
    [events, region, type, when, today]
  );

  /* Counts on the chips describe the other two filters, so a chip never reads zero
     while showing results — the count is what you would get by clicking it. */
  const countFor = (key: 'region' | 'type', value: string) =>
    events.filter(
      (e) =>
        (key === 'region' ? e.region === value : region === 'all' || e.region === region) &&
        (key === 'type' ? e.type === value : type === 'all' || e.type === type) &&
        inWhen(e)
    ).length;

  const grouped = useMemo(() => {
    const byType = new Map<string, BrowserEvent[]>();
    for (const event of matching) {
      const held = byType.get(event.type) ?? [];
      held.push(event);
      byType.set(event.type, held);
    }
    return [...byType.entries()].map(([name, list]) => ({
      name,
      list: list.slice().sort((a, b) => (a.start ?? '9999').localeCompare(b.start ?? '9999')),
    }));
  }, [matching]);

  return (
    <>
      <div className="event-filters">
        <div className="event-filter">
          <span className="eyebrow">Region</span>
          <div className="window-chips" role="group" aria-label="Region">
            <button
              type="button"
              className="window-chip"
              aria-pressed={region === 'all'}
              onClick={() => setRegion('all')}
            >
              All
            </button>
            {regions.map((r) => (
              <button
                key={r}
                type="button"
                className="window-chip"
                aria-pressed={region === r}
                onClick={() => setRegion(r)}
              >
                {r} <span className="muted">{countFor('region', r)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="event-filter">
          <span className="eyebrow">Type</span>
          <div className="window-chips" role="group" aria-label="Event type">
            <button
              type="button"
              className="window-chip"
              aria-pressed={type === 'all'}
              onClick={() => setType('all')}
            >
              All
            </button>
            {types.map((t) => (
              <button
                key={t}
                type="button"
                className="window-chip"
                aria-pressed={type === t}
                onClick={() => setType(t)}
              >
                {t} <span className="muted">{countFor('type', t)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="event-filter">
          <span className="eyebrow">When</span>
          <div className="window-chips" role="group" aria-label="When">
            {WHEN.map((w) => (
              <button
                key={w.id}
                type="button"
                className="window-chip"
                aria-pressed={when === w.id}
                onClick={() => setWhen(w.id)}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.9rem' }}>
        <b className="mono">{matching.length}</b> event{matching.length === 1 ? '' : 's'}
        {region === 'all' ? '' : ` in ${region}`}
        {type === 'all' ? '' : ` · ${type}`}
        {when === 'all' ? '' : ` · ${when}`}
      </p>

      {matching.length === 0 ? (
        <p className="empty">Nothing announced for that combination yet.</p>
      ) : (
        grouped.map((group) => (
          <section key={group.name} className="section" style={{ paddingBottom: 0 }}>
            <div className="section-head">
              <h2 className="display">{group.name}</h2>
              <span className="muted" style={{ fontSize: '0.78rem' }}>
                {group.list.length} event{group.list.length === 1 ? '' : 's'}
              </span>
            </div>

            <ul className="event-list">
              {group.list.map((event, i) => {
                const past = Boolean(event.start && event.start < today);
                return (
                  <li
                    key={`${event.name}-${event.date}-${i}`}
                    className={`event-row${past ? ' event-past' : ''}`}
                  >
                    <div className="event-when">
                      <span className="mono">{event.date}</span>
                      {past ? <span className="event-tag">over</span> : null}
                    </div>
                    <div className="event-what">
                      <span className="event-name">
                        <b>{event.name}</b>
                        {event.region ? <span className="event-tag">{event.region}</span> : null}
                        {event.label ? <span className="muted">{event.label}</span> : null}
                      </span>
                      <span className={event.venue ? 'muted' : 'muted none'}>
                        {event.venue ?? 'Venue not announced'}
                      </span>
                      {/*
                        When you can buy a ticket. The per-event note is what the
                        organiser said; the month table is Bandai's own guideline and
                        is labelled as one, because they say it varies by organiser.
                      */}
                      {event.registrationNote ? (
                        <span className="event-opens">{event.registrationNote}</span>
                      ) : event.opens && !past ? (
                        <span className="event-opens">
                          Registration opens {openingLabel(event.opens)}
                          {event.region && times[event.region] ? `, ${times[event.region]}` : ''}
                          <span className="muted"> · guideline</span>
                        </span>
                      ) : null}
                    </div>
                    <div className="event-go">
                      {event.link ? (
                        <a
                          href={event.link}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="chip"
                        >
                          Register →
                        </a>
                      ) : (
                        <span className="muted" style={{ fontSize: '0.74rem' }}>
                          No link yet
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
