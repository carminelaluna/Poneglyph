import type { Metadata } from 'next';
import { getEvent, prerenderableEvents } from '@/lib/events';
import EventView from './EventView';
import '../../decks.css';

type Params = { params: Promise<{ id: string }> };

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
