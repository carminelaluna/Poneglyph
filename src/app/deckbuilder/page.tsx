import type { Metadata } from 'next';
import Link from 'next/link';
import DeckBuilder from './DeckBuilder';
import './deckbuilder.css';

export const metadata: Metadata = {
  title: 'Deck builder',
  description:
    'Build a ONE PIECE CARD GAME deck in the browser: pick a Leader, fill fifty cards from its colours, and see copy limits, rotation and the banned list checked as you go. Export to OPTCGSim.',
};

export default function DeckBuilderPage() {
  return (
    <div className="shell" style={{ paddingBlock: '2rem 3rem' }}>
      <p className="eyebrow">Deck builder</p>
      <h1
        className="display"
        style={{ fontSize: 'clamp(1.7rem, 3.4vw, 2.5rem)', margin: '0.5rem 0 0' }}
      >
        Fifty cards and a Leader
      </h1>
      <p className="muted" style={{ maxWidth: '68ch', marginTop: '0.8rem' }}>
        Pick a Leader and the pool narrows to what it can play. Copy limits, rotation and the{' '}
        <Link href="/banlist">banned list</Link> are checked while you build, and the export is
        the same one the decklist pages use.
      </p>

      {/*
        No accounts, so no saved decks — and saying so is better than a Save button
        that turns out to mean "until you clear your browser".
      */}
      <div className="notice">
        <p style={{ margin: 0 }}>
          <strong>Your deck lives in the address bar.</strong> Copy the URL and you have shared
          it; the last one you touched is also kept in this browser so a closed tab does not
          lose it. There are no accounts here and nothing is uploaded.
        </p>
      </div>

      <DeckBuilder />
    </div>
  );
}
