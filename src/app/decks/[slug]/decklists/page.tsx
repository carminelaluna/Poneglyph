import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { archetypes, getArchetype } from '@/lib/decks';
import SubHead from '../SubHead';
import DecklistsView from './DecklistsView';
import '../../../decks.css';

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return archetypes.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const a = getArchetype(slug);
  if (!a) return { title: 'Archetype not found' };
  return {
    title: `${a.name} decklists`,
    description: `Every recorded ${a.name} (${a.leaderId}) decklist in the ONE PIECE CARD GAME archive, by best finish, newest or oldest.`,
  };
}

export default async function ArchetypeDecklistsPage({ params }: Params) {
  const { slug } = await params;
  const archetype = getArchetype(slug);
  if (!archetype) notFound();

  return (
    <div className="shell" style={{ paddingBottom: '3rem' }}>
      <SubHead archetype={archetype} section="Decklists" back={`/decks/${archetype.slug}`} />
      <DecklistsView leaderId={archetype.leaderId} slug={archetype.slug} />
    </div>
  );
}
