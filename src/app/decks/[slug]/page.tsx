import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ColorPips } from '@/components/CardTile';
import RulesText from '@/components/RulesText';
import { art, getCard } from '@/lib/cards';
import { pigment } from '@/lib/colors';
import { archetypes, getArchetype } from '@/lib/decks';
import ArchetypeView from './ArchetypeView';
import '../../decks.css';

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return archetypes.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const a = getArchetype(slug);
  if (!a) return { title: 'Archetype not found' };
  return {
    title: `${a.colors.join('/')} ${a.name} decks`,
    description: `${a.name} (${a.leaderId}) in the ONE PIECE CARD GAME metagame: core list, win rate and tournament decklists over the last 7, 15, 30 or 90 days, or since a set entered play.`,
  };
}

export default async function ArchetypePage({ params }: Params) {
  const { slug } = await params;
  const archetype = getArchetype(slug);
  if (!archetype) notFound();

  const leader = getCard(archetype.leaderId);

  return (
    <div className="shell" style={{ paddingBottom: '3rem' }}>
      <div className="arch-head">
        <img src={art(archetype.leaderId, 600)} alt={`${archetype.name} (${archetype.leaderId})`} />

        <div>
          <p className="eyebrow">
            <Link href="/decks">Metagame</Link> · Archetype
          </p>
          <h1
            className="display"
            style={{ fontSize: 'clamp(1.7rem, 3.6vw, 2.6rem)', margin: '0.4rem 0 0' }}
          >
            <span style={{ color: 'var(--glyph-dim)' }}>{archetype.colors.join('/')}</span>{' '}
            {archetype.name}
          </h1>
          <div className="card-line" style={{ marginTop: '0.7rem' }}>
            <ColorPips colors={archetype.colors} />
            <span>{archetype.colors.join(' / ')}</span>
            <span className="dot">·</span>
            <Link href={`/cards/${archetype.leaderId.toLowerCase()}`} className="mono">
              {archetype.leaderId}
            </Link>
          </div>

          {leader?.effect ? (
            <div className="rules" style={{ marginTop: '1.35rem' }}>
              <RulesText text={leader.effect} />
            </div>
          ) : null}
        </div>
      </div>

      <ArchetypeView
        leaderId={archetype.leaderId}
        slug={archetype.slug}
        glow={pigment(archetype.colors[0] ?? '')}
      />
    </div>
  );
}
