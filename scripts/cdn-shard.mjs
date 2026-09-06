/**
 * Which art bundle a printing lives in.
 *
 * Cloudflare Pages allows **20,000 files per deployment on the free plan** (100,000
 * on a paid one, which is the other way out). Three widths per printing means the
 * bundle is three times the printing count: 4,843 printings is 14,529 files, 73% of
 * the limit, and a set adds roughly 250–400 printings. That is about five sets of
 * headroom.
 *
 * Every other way out costs a reader something. Dropping the 96px tier sends a
 * 320px image to a 44px table row — a metagame table goes from 40 KB of thumbnails
 * to 290 KB, and the card browser's list view from 200 KB to 1.45 MB, which is the
 * regression this project already fought once. Dropping the 600px tier softens the
 * lightbox, which is the one place somebody is actually looking at the card. Moving
 * a tier into the site build cannot work: `publish-site.yml` has no card art, which
 * is 1.66 GB and deliberately not in git.
 *
 * Two projects cost a reader nothing. This decides which one a printing is in.
 *
 * ## Nothing changes until the second URL is set
 *
 * `build-cdn.mjs` splits only with `--split`, and `lib/art.ts` uses a second host
 * only when `NEXT_PUBLIC_CDN_URL_B` is set. Unset, every printing resolves to the
 * first bundle exactly as before, so a checkout with one project keeps working and
 * the lever is pulled deliberately rather than by upgrading.
 *
 * ## The copy in lib/art.ts
 *
 * This exists **twice**, here and in `src/lib/art.ts`, because a build script
 * cannot import TypeScript and the browser copy has to be tiny. If the two ever
 * disagree, every image in one half of the bundle 404s. `tests/parity.test.ts`
 * lifts the source text of both and runs them against every printing id, which is
 * the same guard `shardOf` and `playerSlugOf` already have.
 *
 * FNV-1a, matching `shardOf` — one hashing algorithm in this repository rather than
 * two, and `Math.imul` is what keeps the multiply in 32 bits so Node and the
 * browser agree.
 */

/** How many bundles the art is spread over when split. */
export const CDN_BUNDLES = 2;

/** `0` or `1` — the bundle this printing's files belong in. */
export function cdnShardOf(printingId) {
  let hash = 2166136261;
  const key = String(printingId);
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % CDN_BUNDLES;
}

/** The directory name a bundle is built into, under `cdn/`. */
export const bundleDir = (shard) => String.fromCharCode(97 + shard);
