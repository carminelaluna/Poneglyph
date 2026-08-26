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

export const ART_WIDTHS = [96, 320, 600] as const;
export type ArtWidth = (typeof ART_WIDTHS)[number];

/**
 * @param width the width this image is actually rendered at, doubled for retina —
 *   96 for table rows, 320 for grid tiles, 600 for the detail view and lightbox.
 */
export const art = (printingId: string, width: ArtWidth = 320) =>
  /* The proxy is a route in this app, so under a base path it moves with it. */
  CDN ? `${CDN}/${printingId}_${width}.webp` : asset(`art/${printingId}`);

/** Every width, so the browser can choose for the layout and the screen. */
export const artSrcSet = (printingId: string) =>
  CDN ? ART_WIDTHS.map((w) => `${CDN}/${printingId}_${w}.webp ${w}w`).join(', ') : undefined;

export const cdnEnabled = Boolean(CDN);
