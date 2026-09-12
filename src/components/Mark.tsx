import { asset } from '@/lib/paths';

export default function Mark({ size = 26 }: { size?: number }) {
  return (
    <img
      className="mark-glyph"
      src={asset('brand/mark-128.png')}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
    />
  );
}
