import type { Metadata } from 'next';
import Link from 'next/link';
import CompareView from './CompareView';
import '../decks.css';

export const metadata: Metadata = {
  title: 'Japanese and English, side by side',
  description:
    'What is winning in the Japanese ONE PIECE CARD GAME metagame and what is winning in English, counted the same way — share of recorded first places, with the sample beside every figure.',
};

export default function ComparePage() {
  return (
    <div className="shell" style={{ paddingBottom: '3rem' }}>
      <div style={{ paddingBlock: '2rem 0.5rem' }}>
        <p className="eyebrow">
          <Link href="/decks">Metagame</Link> · Regions
        </p>
        <h1
          className="display"
          style={{ fontSize: 'clamp(1.7rem, 3.6vw, 2.6rem)', margin: '0.4rem 0 0' }}
        >
          Japanese and English
        </h1>
      </div>

      <CompareView />
    </div>
  );
}
