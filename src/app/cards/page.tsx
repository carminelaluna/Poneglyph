import type { Metadata } from 'next';
import CardBrowser from './CardBrowser';
import { filters, meta } from '@/lib/cards';
import '../browse.css';

export const metadata: Metadata = {
  title: 'Card search',
  description: `Filter all ${meta.counts.cards.toLocaleString('en-US')} ONE PIECE CARD GAME cards by colour, card type, cost, power, counter, attribute, rarity, trait, keyword and set.`,
};

export default function CardsPage() {
  return (
    <>
      <div className="shell" style={{ paddingTop: '2rem' }}>
        <p className="eyebrow">Card search</p>
        <h1 className="display" style={{ fontSize: 'clamp(1.5rem, 3vw, 2.1rem)', margin: '0.5rem 0 0' }}>
          The archive
        </h1>
      </div>
      <CardBrowser facets={filters} />
    </>
  );
}
