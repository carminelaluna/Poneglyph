import Link from 'next/link';
import { ColorPips } from '@/components/CardTile';
import { art } from '@/lib/cards';
import type { Archetype } from '@/lib/decks';

export default function SubHead({
  archetype,
  section,
  back,
}: {
  archetype: Archetype;
  section: string;
  back: string;
}) {
  return (
    <div className="arch-sub-head">
      <img src={art(archetype.leaderId, 96)} alt="" />
      <div>
        <p className="eyebrow">
          <Link href="/decks">Metagame</Link> · <Link href={back}>{archetype.name}</Link> ·{' '}
          {section}
        </p>
        <h1 className="display" style={{ fontSize: 'clamp(1.4rem, 2.6vw, 2rem)', margin: '0.3rem 0 0' }}>
          <span style={{ color: 'var(--glyph-dim)' }}>{archetype.colors.join('/')}</span>{' '}
          {archetype.name}
        </h1>
        <div className="card-line" style={{ marginTop: '0.5rem' }}>
          <ColorPips colors={archetype.colors} />
          <Link href={`/cards/${archetype.leaderId.toLowerCase()}`} className="mono">
            {archetype.leaderId}
          </Link>
        </div>
      </div>
    </div>
  );
}
