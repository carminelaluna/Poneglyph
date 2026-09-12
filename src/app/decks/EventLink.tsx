'use client';

import Link from 'next/link';

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
