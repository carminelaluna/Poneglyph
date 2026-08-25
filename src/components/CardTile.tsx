import Link from 'next/link';
import { art, artSrcSet } from '@/lib/cards';
import { pigment } from '@/lib/colors';

export type TileCard = {
  id: string;
  name: string;
  colors: string[];
  image: string | null;
  printingCount?: number;
  priceLow?: number | null;
};

export function ColorPips({ colors }: { colors: string[] }) {
  if (!colors.length) return null;
  return (
    <span className="pips" aria-label={colors.join(', ')}>
      {colors.map((c) => (
        <i
          key={c}
          className="pip"
          style={{ '--pip': pigment(c) } as React.CSSProperties}
          title={c}
        />
      ))}
    </span>
  );
}

/**
 * A card tile: art carved into the slab, lifting out on hover with its own
 * pigment bleeding into the groove around it.
 */
export default function CardTile({ card, priority = false }: { card: TileCard; priority?: boolean }) {
  const glow = card.colors.length === 1 ? pigment(card.colors[0]) : pigment(card.colors[0] ?? '');

  return (
    <Link
      href={`/cards/${card.id.toLowerCase()}`}
      className="tile"
      style={{ '--pigment': glow } as React.CSSProperties}
    >
      <div className="tile-art">
        <img
          src={art(card.id, 320)}
          srcSet={artSrcSet(card.id)}
          sizes="(max-width: 620px) 45vw, 200px"
          alt={`${card.name} (${card.id})`}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
        />
        {card.printingCount && card.printingCount > 1 ? (
          <span className="tile-badge">{card.printingCount} arts</span>
        ) : null}
      </div>
      <div className="tile-meta">
        <ColorPips colors={card.colors} />
        <span className="tile-name">{card.name}</span>
      </div>
      <div className="tile-meta" style={{ marginTop: '0.1rem' }}>
        <span className="tile-code">{card.id}</span>
        {typeof card.priceLow === 'number' ? (
          <span className="tile-price" style={{ marginLeft: 'auto' }}>
            ${card.priceLow.toFixed(2)}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
