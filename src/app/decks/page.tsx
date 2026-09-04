import type { Metadata } from 'next';
import Link from 'next/link';
import MetaBrowser from './MetaBrowser';
import { decksMeta, hasDeckData, tournaments } from '@/lib/decks';
import '../decks.css';
/* The events section below the table is a directory table; see directory.css. */
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
      {/*
        The corpus sizes and the five-figure stat row used to sit here. The controls
        below already report the count for whatever is chosen, and every figure the
        row held is answered by the table or by /data — so it was five numbers a
        reader had to scroll past to reach the one they came for.
      */}
      {/*
        The two directories are not in the top bar — eight entries is already what a
        phone will hold — so they are linked from the page someone is on when the
        question occurs to them: which event was that, and who is this player.
      */}
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
