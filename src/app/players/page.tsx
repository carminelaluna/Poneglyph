import type { Metadata } from 'next';
import Link from 'next/link';
import PlayerBrowser from './PlayerBrowser';
import '../decks.css';
import '../tournaments/directory.css';

export const metadata: Metadata = {
  title: 'Players',
  description:
    'Everyone with a recorded result: how many decklists, how many events, top eights, wins, and the archetype they play most.',
};

export default function PlayersPage() {
  return (
    <div className="shell" style={{ paddingBlock: '2rem 3rem' }}>
      <p className="eyebrow">Results</p>
      <h1
        className="display"
        style={{ fontSize: 'clamp(1.7rem, 3.4vw, 2.5rem)', margin: '0.5rem 0 0' }}
      >
        Players on record
      </h1>
      <p className="muted" style={{ maxWidth: '68ch', marginTop: '0.8rem' }}>
        Assembled from the same{' '}
        <Link href="/tournaments" className="inline-link">tournament results</Link> as everything else here — nobody
        signs up, and there is nothing to opt into. A name links to every deck that person has
        on record. Spellings are never merged into one person:{' '}
        <Link href="/data" className="inline-link">how the archive is built</Link> says why.
      </p>

      <PlayerBrowser />
    </div>
  );
}
