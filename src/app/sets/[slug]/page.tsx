import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import CardTile from '@/components/CardTile';
import { CARD_COLORS, getSet, getSetCards, sets } from '@/lib/cards';
import { pigment } from '@/lib/colors';

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return sets.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const set = getSet(slug);
  if (!set) return { title: 'Set not found' };
  return {
    title: `${set.code} — ${set.name}`,
    description: `Every card in ${set.code} ${set.name}: ${set.cardCount} cards across ${set.printingCount} printings, with stat lines and rules text.`,
  };
}

export default async function SetPage({ params }: Params) {
  const { slug } = await params;
  const set = getSet(slug);
  if (!set) notFound();

  const setCards = getSetCards(set.code);
  const byColor = CARD_COLORS.map((color) => ({
    color,
    count: setCards.filter((c) => c.colors.includes(color)).length,
  })).filter((c) => c.count > 0);

  const byCategory = ['Leader', 'Character', 'Event', 'Stage']
    .map((category) => ({ category, count: setCards.filter((c) => c.category === category).length }))
    .filter((c) => c.count > 0);

  return (
    <div className="shell" style={{ paddingBlock: '2rem 3rem' }}>
      <p className="eyebrow">
        <Link href="/sets">Sets</Link> · {set.group}
      </p>
      <h1
        className="display"
        style={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.5rem)', margin: '0.5rem 0 0' }}
      >
        {set.name}
      </h1>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.5rem 1.25rem',
          marginTop: '0.9rem',
          fontSize: '0.86rem',
          color: 'var(--glyph-mid)',
        }}
      >
        <span className="mono">{set.code}</span>
        <span>
          {set.cardCount} cards · {set.printingCount} printings
        </span>
        <span style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
          {byColor.map((c) => (
            <span
              key={c.color}
              className="chip"
              style={{ borderColor: 'var(--edge)', gap: '0.3rem' }}
              title={`${c.count} ${c.color} cards`}
            >
              <i className="pip" style={{ '--pip': pigment(c.color) } as React.CSSProperties} />
              {c.count}
            </span>
          ))}
        </span>
        <span className="muted">{byCategory.map((c) => `${c.count} ${c.category}`).join(' · ')}</span>
      </div>

      <div className="section-head" style={{ marginTop: '2rem' }}>
        <h2 className="display">Card list</h2>
        <Link href={`/cards?set=${set.code}`} className="muted" style={{ fontSize: '0.8rem' }}>
          Open in card search →
        </Link>
      </div>

      <div className="card-grid">
        {setCards.map((card) => (
          <CardTile key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}
