'use client';

import Link from 'next/link';
import { isNamedPlayer, playerSlug } from '@/lib/meta';

/**
 * A player name, linked to their results when there is a name to link.
 * Placeholders stay plain text — a page for "NA" would be a page about nothing.
 */
export default function PlayerLink({ name, className }: { name: string; className?: string }) {
  if (!isNamedPlayer(name)) {
    return <span className="muted">{name}</span>;
  }
  return (
    <Link href={`/player/${playerSlug(name)}`} className={className ?? 'player-link'}>
      {name}
    </Link>
  );
}
