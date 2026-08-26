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
        <Link href="/tournaments">tournament results</Link> as everything else here — nobody
        signs up, and there is nothing to opt into. A name links to every deck that person has
        on record.
      </p>

      <div className="notice">
        <p style={{ margin: 0 }}>
          <strong>Spellings are never merged.</strong> <code>Ric Masterflash</code> and{' '}
          <code>ricmasterflash</code> stay two entries unless the sources wrote them
          identically: guessing that two handles are one person is the kind of tidying that
          silently invents a career. Placeholders like <code>NA</code> are dropped rather than
          listed — that string alone appears 172 times and would otherwise top this table.
        </p>
      </div>

      <PlayerBrowser />
    </div>
  );
}
