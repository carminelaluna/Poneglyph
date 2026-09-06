/**
 * Card art URLs.
 *
 * Deliberately its own module with no data imports: the client components that
 * render grids need these helpers, and reaching into `lib/cards.ts` for them would
 * pull 4.4 MB of card JSON into the browser bundle.
 *
 * With `NEXT_PUBLIC_CDN_URL` set, art comes from the WebP bundle on Cloudflare
 * Pages — three widths per printing, named `{id}_{width}.webp`. Without it the
 * local `/art/[id]` proxy answers, so a checkout with no CDN configured still
 * works; that proxy is also what produced the bundle, by fetching each image from
 * the official CDN once.
 *
 * The widths exist because one 600x838 source is rendered at 38 px in a table row
 * and at 600 px in the lightbox. Sending the original to both is what made a grid
 * of 60 cards weigh 18 MB.
 */

import { asset } from './paths';

const CDN = process.env.NEXT_PUBLIC_CDN_URL?.replace(/\/$/, '');

/**
 * A second bundle, for when one Pages project runs out of room.
 *
 * Cloudflare allows 20,000 files per deployment on the free plan and three widths
 * per printing means the bundle is three times the printing count. Two projects
 * are the only way out that costs a reader nothing — dropping the 96px tier sends
 * a 320px image to a 44px table row, dropping the 600px one softens the lightbox.
 * See scripts/cdn-shard.mjs.
 *
 * **Unset, everything resolves to the first bundle**, exactly as before. The split
 * is a lever pulled deliberately: set this, rebuild the art with `--split`, deploy
 * both projects.
 */
const CDN_B = process.env.NEXT_PUBLIC_CDN_URL_B?.replace(/\/$/, '');

export const ART_WIDTHS = [96, 320, 600] as const;
export type ArtWidth = (typeof ART_WIDTHS)[number];

/** How many bundles the art is spread over when split. Mirrors cdn-shard.mjs. */
const CDN_BUNDLES = 2;

/**
 * Which bundle a printing is in — FNV-1a, and **an identical copy lives in
 * scripts/cdn-shard.mjs**.
 *
 * Duplicated because a build script cannot import TypeScript and this file has to
 * stay small enough to ship to the browser. If the two ever disagree, every image
 * in one half of the bundle 404s — so `tests/parity.test.ts` lifts the source of
 * both and runs them against every printing id, the same guard `shardOf` has.
 *
 * `Math.imul` is what keeps the multiply in 32 bits, which is the whole reason two
 * implementations can agree across Node and a browser.
 */
function bundleOf(printingId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < printingId.length; i++) {
    hash ^= printingId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % CDN_BUNDLES;
}

/** The host serving this printing: the second bundle only when one is configured. */
const hostFor = (printingId: string) =>
  CDN_B && bundleOf(printingId) === 1 ? CDN_B : CDN;

/**
 * @param width the width this image is actually rendered at, doubled for retina —
 *   96 for table rows, 320 for grid tiles, 600 for the detail view and lightbox.
 */
export const art = (printingId: string, width: ArtWidth = 320) => {
  const host = hostFor(printingId);
  /* The proxy is a route in this app, so under a base path it moves with it. */
  return host ? `${host}/${printingId}_${width}.webp` : asset(`art/${printingId}`);
};

/** Every width, so the browser can choose for the layout and the screen. */
export const artSrcSet = (printingId: string) => {
  const host = hostFor(printingId);
  return host
    ? ART_WIDTHS.map((w) => `${host}/${printingId}_${w}.webp ${w}w`).join(', ')
    : undefined;
};

export const cdnEnabled = Boolean(CDN);
