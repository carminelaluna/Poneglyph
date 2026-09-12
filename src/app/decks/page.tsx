import type { Metadata } from 'next';
import Link from 'next/link';
import MetaBrowser from './MetaBrowser';
import { decksMeta, hasDeckData, tournaments } from '@/lib/decks';
import '../decks.css';
import '../tournaments/directory.css';

export const metadata: Metadata = {
  title: 'Metagame',
  description:
    'ONE PIECE CARD GAME metagame: archetype share, win rates and tournament decklists over the last 7, 15, 30 or 90 days, or since a set entered play.',
};

export default function DecksPage() {
  if (!hasDeckData) return <EmptyState />;

  return (
    <div className="shell" style={{ paddingBlock: '2rem 3rem' }}>
      <p className="eyebrow">Metagame</p>
      <h1 className="display" style={{ fontSize: 'clamp(1.7rem, 3.4vw, 2.5rem)', margin: '0.5rem 0 0' }}>
        What people are actually playing
      </h1>
      <p className="muted" style={{ fontSize: '0.78rem', marginTop: '1rem' }}>
        Browse the sources of all this: <Link href="/tournaments">every recorded tournament</Link>{' '}
        · <Link href="/players">everyone with a result</Link>
      </p>

      <div className="section-head" style={{ marginTop: '2.25rem' }}>
        <h2 className="display">Archetype share</h2>
        <span className="muted" style={{ fontSize: '0.78rem' }}>
          Bar width is share of the window · trend compares the window before it
        </span>
      </div>

      <MetaBrowser />

      <p className="muted" style={{ fontSize: '0.76rem', marginTop: '2rem', maxWidth: '74ch' }}>
        Tournament results and decklists come from{' '}
        <a href={decksMeta.source.home} target="_blank" rel="noreferrer noopener">
          {decksMeta.source.label}
        </a>
        , covering {tournaments.length.toLocaleString('en-US')} events with at least{' '}
        {decksMeta.filters.minPlayers} players. Win rates are Swiss records as reported by
        organisers, so they describe the events on record rather than the game as a whole.{' '}
        <strong>Release windows</strong> start when a set first appeared in tournament results,
        which is not the same as its paper release date — online events run new sets first.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="shell" style={{ paddingBlock: '2rem 4rem' }}>
      <p className="eyebrow">Metagame</p>
      <h1 className="display" style={{ fontSize: 'clamp(1.7rem, 3.4vw, 2.5rem)', margin: '0.5rem 0 0' }}>
        No decklists yet
      </h1>
      <div className="no-data">
        <p style={{ marginTop: 0 }}>
          The deck archive is built separately from the card archive. Run the deck ingest to pull
          tournament results and decklists:
        </p>
        <p>
          <code>npm run ingest:decks</code>
        </p>
        <p style={{ marginBottom: 0 }} className="muted">
          It is incremental — each run spends a fixed request budget and continues where the last
          one stopped, so it can be scheduled.
        </p>
      </div>
    </div>
  );
}
