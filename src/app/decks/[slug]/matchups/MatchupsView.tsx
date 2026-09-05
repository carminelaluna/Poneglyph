'use client';

import Link from 'next/link';
import Matchups from '../Matchups';
import { filterDecks, windowEnd, windowStart } from '@/lib/meta';
import { IndexError, WindowBar, useMetaIndex, useWindow, windowHref } from '../../useMeta';

/**
 * Every recorded matchup for one archetype, uncapped.
 *
 * The archetype page draws ten and links here, which is the same trade the
 * metagame table makes with its top ten: the head is what a reader came for and
 * the tail is a different question, asked deliberately.
 *
 * It reads the same index and the same query string as the page it came from, so
 * the window travels with the click. Both files are already cached by then — this
 * costs a navigation and no payload.
 */
export default function MatchupsView({ leaderId, slug }: { leaderId: string; slug: string }) {
  const { window: window_, venues, tiers, region, bar, query } = useWindow();
  const { index, error } = useMetaIndex(region, window_);

  if (error) return <IndexError error={error} />;
  if (!index) return <p className="empty">Reading recorded pairings…</p>;

  /* The same count the archetype page shows, so the bar does not disagree with it. */
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
