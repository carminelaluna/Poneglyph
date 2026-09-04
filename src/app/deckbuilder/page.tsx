import type { Metadata } from 'next';
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
      <DeckBuilder />
    </div>
  );
}
