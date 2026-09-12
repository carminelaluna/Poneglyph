import { asset } from './paths';

const CDN = process.env.NEXT_PUBLIC_CDN_URL?.replace(/\/$/, '');

const CDN_B = process.env.NEXT_PUBLIC_CDN_URL_B?.replace(/\/$/, '');

export const ART_WIDTHS = [96, 320, 600] as const;
export type ArtWidth = (typeof ART_WIDTHS)[number];

const CDN_BUNDLES = 2;

function bundleOf(printingId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < printingId.length; i++) {
    hash ^= printingId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % CDN_BUNDLES;
}

const hostFor = (printingId: string) =>
  CDN_B && bundleOf(printingId) === 1 ? CDN_B : CDN;

export const art = (printingId: string, width: ArtWidth = 320) => {
  const host = hostFor(printingId);
  return host ? `${host}/${printingId}_${width}.webp` : asset(`art/${printingId}`);
};

export const artSrcSet = (printingId: string) => {
  const host = hostFor(printingId);
  return host
    ? ART_WIDTHS.map((w) => `${host}/${printingId}_${w}.webp ${w}w`).join(', ')
    : undefined;
};

export const cdnEnabled = Boolean(CDN);
