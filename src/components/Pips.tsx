import { pigment } from '@/lib/colors';

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
