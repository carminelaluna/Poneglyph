import type { Metadata } from 'next';
import { getEvent, prerenderableEvents } from '@/lib/events';
import EventView from './EventView';
import '../../decks.css';

type Params = { params: Promise<{ id: string }> };

/**
 * Events with a real field get a page of their own; the rest are reached through
 * the client-side fallback.
 *
 * The page body is rendered in the browser either way — see lib/shards.ts — so what
 * this list actually buys is a real URL with a 200 and a title and description
 * written from the data. That is worth having for a Regional and not worth 5.5 GB
 * for every shop tournament ever recorded.
 */
export function generateStaticParams() {
  return prerenderableEvents(8).map((id) => ({ id }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const event = getEvent(id);
  if (!event) return { title: 'Event' };
  const won = event.winner ? ` Won by ${event.winner.player} with ${event.winner.leaderName}.` : '';
  return {
    title: `${event.name} — ${event.date}`,
    description: `${event.recorded} recorded ONE PIECE CARD GAME decklists from ${event.name} on ${event.date}.${won}`,
  };
}

export default async function EventPage({ params }: Params) {
  const { id } = await params;
  return <EventView id={id} />;
}
