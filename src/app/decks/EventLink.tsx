'use client';

import Link from 'next/link';

/**
 * An event name, linked to its page. Rows without an event id predate the field
 * and stay plain text rather than pointing at a page that cannot exist.
 */
export default function EventLink({
  name,
  eventId,
  type,
}: {
  name: string;
  eventId?: string;
  type?: string;
}) {
  const label = (
    <>
      {name}
      {type ? <span className="muted"> · {type}</span> : null}
    </>
  );
  if (!eventId) return <span className="muted">{label}</span>;
  return (
    <Link href={`/event/${eventId}`} className="event-link">
      {label}
    </Link>
  );
}
