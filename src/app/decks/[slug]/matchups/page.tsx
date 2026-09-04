import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { archetypes, getArchetype } from '@/lib/decks';
import SubHead from '../SubHead';
import MatchupsView from './MatchupsView';
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
    title: `${a.name} matchups`,
    description: `Every recorded matchup for ${a.name} (${a.leaderId}) in the ONE PIECE CARD GAME metagame, from published tournament brackets.`,
  };
}

export default async function ArchetypeMatchupsPage({ params }: Params) {
  const { slug } = await params;
  const archetype = getArchetype(slug);
  if (!archetype) notFound();

  return (
    <div className="shell" style={{ paddingBottom: '3rem' }}>
      <SubHead archetype={archetype} section="Matchups" back={`/decks/${archetype.slug}`} />
      <MatchupsView leaderId={archetype.leaderId} slug={archetype.slug} />
    </div>
  );
}
