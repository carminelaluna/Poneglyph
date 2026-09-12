import type { Metadata } from 'next';
import eventsJson from '@data/events-official.json';
import EventBrowser, { type BrowserEvent } from './EventBrowser';
import './events.css';

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
    'Official ONE PIECE CARD GAME events: Regionals, Finals and Treasure Cups, filterable by region and type, with venues and when registration opens.',
};

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
