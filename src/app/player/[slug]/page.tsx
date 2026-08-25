import type { Metadata } from 'next';
import { getPlayer, prerenderablePlayers } from '@/lib/players';
import PlayerView from './PlayerView';
import '../../decks.css';

type Params = { params: Promise<{ slug: string }> };

/**
 * Regulars get a page of their own; everyone else is reached through the
 * client-side fallback. The body renders in the browser either way — this list
 * buys a real URL and a title written from the data.
 */
export function generateStaticParams() {
  return prerenderablePlayers(5).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const player = getPlayer(slug);
  if (!player) return { title: 'Player' };
  return {
    title: `${player.name} — results`,
    description: `${player.results.length} recorded ONE PIECE CARD GAME results for ${player.name}: events, finishes and the decks they played.`,
  };
}

export default async function PlayerPage({ params }: Params) {
  const { slug } = await params;
  return <PlayerView slug={slug} />;
}
