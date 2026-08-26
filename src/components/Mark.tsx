import { asset } from '@/lib/paths';

/**
 * The mark: a poneglyph — a stone slab carved with blocks in the game's six colours.
 *
 * A raster rather than the inline SVG that used to be here. The drawing is full
 * colour by design, so the `currentColor` the SVG relied on had nothing left to do,
 * and the artwork is the same file the favicon and the app icons come from — one
 * drawing, not two that drift.
 *
 * Served at 128 for a 26 px slot: nearly five times the pixels, which covers a 2x
 * and costs 1.7 KB.
 *
 * `asset()` because Next rewrites `<Link>` hrefs under a basePath but not the `src`
 * of an image written by hand — see lib/paths.ts.
 */
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
