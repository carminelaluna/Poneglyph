import type { Metadata } from 'next';
import eventsJson from '@data/events-official.json';
import './events.css';

/**
 * Official events, all on one page.
 *
 * Bandai publishes a page per series and per season — Regionals here, Treasure Cups
 * there, Finals somewhere else — so finding out what is on near you means opening
 * six pages and reading through each. This is the same information grouped by what
 * kind of event it is.
 *
 * Rendered at build time. The whole set is 14 KB and rebuilt with the site, so there
 * is nothing for the browser to fetch.
 */

type OfficialEvent = {
  /** The organiser, where they name one — "PlayLATAM", "Play!TCG". */
  name: string;
  /**
   * The heading the name displaced, when there was one. On the Finals pages that is
   * "[Season 1]", which is shared by three events and useless as a name but worth
   * keeping beside it.
   */
  label?: string | null;
  /** The region heading the event sat under, when the page uses them. */
  region?: string | null;
  /** As they wrote it — "August 15-16, 2026", "July 30 - August 2, 2026". */
  date: string;
  /** First day, for sorting. Null when their text could not be read. */
  start: string | null;
  venue: string | null;
  link: string | null;
};

type Group = {
  slug: string;
  type: string;
  title: string;
  url: string;
  events: OfficialEvent[];
};

type Events = {
  generatedAt: string;
  source: { id: string; label: string; home: string; index: string };
  counts: { groups: number; events: number; types: number };
  groups: Group[];
};

const events = eventsJson as Events;

export const metadata: Metadata = {
  title: 'Events',
  description:
    'Official ONE PIECE CARD GAME events: Regionals, Finals, Treasure Cups, Extra Grand Battles and more, grouped by type with dates, venues and registration links.',
};

/**
 * The order the types are shown in — competitive weight first, so the page opens on
 * what most people came to check. Anything new that Bandai adds is not in this list
 * and lands at the end rather than disappearing.
 */
const ORDER = [
  'Finals',
  'Regional',
  'Treasure Cup',
  'Extra Grand Battle',
  'Extra Battle',
  'Coliseum',
  'BCG Fest',
  'Mall Tour',
  'Side event',
  'Store event',
  'Pirates Party',
  'Beginners event',
];

const rank = (type: string) => {
  const at = ORDER.indexOf(type);
  return at === -1 ? ORDER.length : at;
};

const anchor = (type: string) => type.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export default function EventsPage() {
  /*
   * "Past" is decided when the site is built, not when the page is read. The events
   * ingest runs several times a day and the site rebuilds with it, so this is never
   * more than a few hours stale — and the date is printed next to every event, which
   * is the part that has to be right.
   */
  const today = new Date().toISOString().slice(0, 10);

  const byType = new Map<string, { type: string; sources: Group[]; events: OfficialEvent[] }>();
  for (const group of events.groups) {
    const held = byType.get(group.type) ?? { type: group.type, sources: [], events: [] };
    held.sources.push(group);
    held.events.push(...group.events);
    byType.set(group.type, held);
  }

  const types = [...byType.values()]
    .map((entry) => ({
      ...entry,
      events: entry.events
        .slice()
        .sort((a, b) => (a.start ?? '9999').localeCompare(b.start ?? '9999')),
    }))
    .sort((a, b) => rank(a.type) - rank(b.type));

  const upcoming = types.reduce(
    (n, t) => n + t.events.filter((e) => !e.start || e.start >= today).length,
    0
  );

  const updated = new Date(events.generatedAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="shell" style={{ paddingBlock: '2rem 3rem' }}>
      <p className="eyebrow">Events</p>
      <h1
        className="display"
        style={{ fontSize: 'clamp(1.7rem, 3.4vw, 2.5rem)', margin: '0.5rem 0 0' }}
      >
        Where to play
      </h1>
      <p className="muted" style={{ maxWidth: '66ch', marginTop: '0.8rem' }}>
        Every official event Bandai has announced, grouped by type instead of spread over a page
        per series. {upcoming} still to come out of {events.counts.events} on record.
      </p>

      <div className="notice">
        <p style={{ margin: 0 }}>
          <strong>Dates, venues and registration come from Bandai.</strong> Read from the{' '}
          <a href={events.source.index} target="_blank" rel="noreferrer noopener">
            official event pages
          </a>{' '}
          and reproduced here for reference — this site is not affiliated with them, takes no
          registrations, and every link below goes to their page or the organiser&rsquo;s. Details
          change; the official page is the one that counts.
        </p>
      </div>

      {types.length === 0 ? (
        <p className="empty">No events are listed right now.</p>
      ) : (
        <>
          <nav className="event-jump" aria-label="Jump to a type">
            {types.map((t) => (
              <a key={t.type} href={`#${anchor(t.type)}`} className="chip chip-link">
                {t.type} <span className="muted">{t.events.length}</span>
              </a>
            ))}
          </nav>

          {types.map((t) => (
            <section key={t.type} id={anchor(t.type)} className="section" style={{ paddingBottom: 0 }}>
              <div className="section-head">
                <h2 className="display">{t.type}</h2>
                <span className="muted" style={{ fontSize: '0.78rem' }}>
                  {t.sources.map((s, i) => (
                    <span key={s.slug}>
                      {i > 0 ? ' · ' : ''}
                      <a href={s.url} target="_blank" rel="noreferrer noopener">
                        {s.title}
                      </a>
                    </span>
                  ))}
                </span>
              </div>

              <ul className="event-list">
                {t.events.map((event, i) => {
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
                        {/*
                          Named, not blank. Several venues are genuinely "TBA" on their
                          side, and an empty line there reads as a bug in this page.
                        */}
                        <span className={event.venue ? 'muted' : 'muted none'}>
                          {event.venue ?? 'Venue not announced'}
                        </span>
                      </div>
                      <div className="event-go">
                        {event.link ? (
                          <a
                            href={event.link}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="chip chip-link"
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
          ))}
        </>
      )}

      <p className="muted" style={{ fontSize: '0.76rem', marginTop: '2.5rem' }}>
        Read from{' '}
        <a href={events.source.home} target="_blank" rel="noreferrer noopener">
          {events.source.label}
        </a>{' '}
        on {updated}. New series appear here on their own — the index is followed rather than a
        list of pages being kept by hand.
      </p>
    </div>
  );
}
