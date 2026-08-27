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
        <Link href="/banlist" className="inline-link">banned list</Link> are checked while you build, and the export is
        the same one the decklist pages use. Reloading starts over — copy the deck for the
        simulator, or save it to an <Link href="/account" className="inline-link">account</Link> to reopen it later.
      </p>

      <DeckBuilder />
    </div>
  );
}
