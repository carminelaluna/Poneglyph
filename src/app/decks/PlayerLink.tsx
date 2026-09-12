'use client';

import Link from 'next/link';
import { isNamedPlayer, playerSlug } from '@/lib/meta';

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
