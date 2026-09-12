import type { Metadata } from 'next';
import { decks, getDeck, ordinal } from '@/lib/decks';
import DeckView from './DeckView';
import '../../decks.css';

type Params = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return decks
    .filter((d) => d.placing !== null && d.placing <= 8)
    .slice(0, 500)
    .map((d) => ({ id: d.id }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const deck = getDeck(id);
  if (!deck) return { title: 'Decklist' };
  const place = deck.placing ? `${ordinal(deck.placing)} place, ` : '';
  return {
    title: `${deck.leaderName} — ${deck.player}`,
    description: `${place}${deck.tournamentName}. ${deck.colors.join('/')} ${deck.leaderName} decklist played by ${deck.player} on ${deck.date.slice(0, 10)}.`,
  };
}

export default async function DeckPage({ params }: Params) {
  const { id } = await params;
  return <DeckView id={id} />;
}
