import type { Metadata } from 'next';
import eventsJson from '@data/events-official.json';
import EventBrowser, { type BrowserEvent } from './EventBrowser';
import './events.css';

/**
 * Official events, all on one page.
 *
 * Bandai publishes a page per series and per season — Regionals here, Treasure Cups
 * there, Finals somewhere else — so finding out what is on near you means opening
 * six pages and reading through each. This is the same information in one place,
 * filterable by region and type.
 *
 * The list is flattened here, at build time, and filtered in the browser. It is 67
 * events, so there is nothing to fetch and nothing to paginate.
 */

type OfficialEvent = {
  name: string;
  label?: string | null;
  region?: string | null;
  date: string;
  start: string | null;
  venue: string | null;
  link: string | null;
  opens?: string | null;
  registrationNote?: string | null;
};

type Group = {
  slug: string;
  type: string;
  title: string;
  url: string;
  events: OfficialEvent[];
  registrationTimes?: Record<string, string>;
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
    'Official ONE PIECE CARD GAME events: Regionals, Finals, Treasure Cups and more, filterable by region and type, with venues, registration links and when registration opens.',
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

export default function EventsPage() {
  const flat: BrowserEvent[] = events.groups
    .flatMap((group) => group.events.map((event) => ({ ...event, type: group.type })))
    .sort((a, b) => rank(a.type) - rank(b.type) || (a.start ?? '9999').localeCompare(b.start ?? '9999'));

  /* One table of opening times for the whole site — they publish the same one. */
  const times: Record<string, string> = {};
  for (const group of events.groups) Object.assign(times, group.registrationTimes ?? {});

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
        Every official event Bandai has announced, in one place instead of a page per series.
        Filter by where you are and what you are looking for.
      </p>

      {/*
        Bandai publishes one registration date per event month and then says it is a
        guideline organisers vary. Their caveat travels with their dates rather than
        being dropped, because presenting the table as a firm time would invent a
        certainty they disclaim. The rest of what this page is — no affiliation, no
        registrations taken — is on /legal, where a statement about the site belongs.
      */}
      <p className="muted source-line">
        Read from Bandai&rsquo;s{' '}
        <a
          href={events.source.index}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-link"
        >
          official event pages
        </a>
        ; this site takes no registrations and every link goes to theirs or the
        organiser&rsquo;s.
        {Object.keys(times).length > 0 ? (
          <>
            {' '}
            Registration usually opens on a Sunday, at{' '}
            {Object.entries(times)
              .map(([region, time]) => `${time} in ${region}`)
              .join(', ')}
            , which they publish as a guideline that organisers vary — check the event&rsquo;s
            own link.
          </>
        ) : null}
      </p>

      {flat.length === 0 ? (
        <p className="empty">No events are listed right now.</p>
      ) : (
        <EventBrowser events={flat} times={times} />
      )}

      <p className="muted" style={{ fontSize: '0.76rem', marginTop: '2.5rem' }}>
        Read from{' '}
        <a href={events.source.home} target="_blank" rel="noreferrer noopener">
          {events.source.label}
        </a>{' '}
        on {updated}, and refreshed every day at noon. New series appear here on their own — the
        index is followed rather than a list of pages being kept by hand.
      </p>
    </div>
  );
}
