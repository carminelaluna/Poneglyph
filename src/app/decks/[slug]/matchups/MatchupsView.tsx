'use client';

import Link from 'next/link';
import Matchups from '../Matchups';
import { filterDecks, windowEnd, windowStart } from '@/lib/meta';
import { IndexError, WindowBar, useMetaIndex, useWindow, windowHref } from '../../useMeta';

export default function MatchupsView({ leaderId, slug }: { leaderId: string; slug: string }) {
  const { window: window_, venues, tiers, region, bar, query } = useWindow();
  const { index, error } = useMetaIndex(region, window_);

  if (error) return <IndexError error={error} />;
  if (!index) return <p className="empty">Reading recorded pairings…</p>;

  const decks = filterDecks(index, window_, venues, tiers).filter((d) => d.l === leaderId).length;

  return (
    <>
      <WindowBar {...bar} index={index} count={decks} noun="decks of this archetype" />

      <Matchups
        leaderId={leaderId}
        from={windowStart(window_, index)}
        to={windowEnd(window_, index)}
        region={region}
      />

      <p style={{ marginTop: '1.6rem' }}>
        <Link href={windowHref(`/decks/${slug}`, query)} className="chip">
          ← Back to the archetype
        </Link>
      </p>
    </>
  );
}
