import { pigment } from '@/lib/colors';

/**
 * A deck's colours as dots.
 *
 * The same markup as `ColorPips` in CardTile, in a module of its own because the
 * browser-rendered pages need it. CardTile imports `art` from `@/lib/cards`, and
 * `cards.ts` imports the card archive — pulling it into a client component would
 * put 4.4 MB of card JSON in the bundle to draw a few coloured circles.
 *
 * `lib/colors.ts` has no imports at all, which is what makes this safe.
 */
export default function Pips({ colors }: { colors: string[] }) {
  if (!colors.length) return null;
  return (
    <span className="pips" aria-label={colors.join(', ')}>
      {colors.map((c) => (
        <i key={c} className="pip" style={{ '--pip': pigment(c) } as React.CSSProperties} title={c} />
      ))}
    </span>
  );
}
