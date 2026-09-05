#!/usr/bin/env node
/**
 * Poneglyph — the link preview image.
 *
 *   node scripts/build-share-image.mjs
 *
 * Run by hand, and the PNG is committed. It is not a build step because it does
 * not need to be: the mark does not change with the data, and making CI render
 * text would put a system font dependency into a build that is otherwise
 * byte-identical between two runs of the same commit. See `generateBuildId` in
 * next.config.mjs for why that property is worth protecting.
 *
 * ## Why 1200×630 rather than the square one
 *
 * `share-1024.png` is 1024×1024, and every unfurl — Twitter, Discord, Slack,
 * Facebook, a search result — is built for 1.91:1. A square gets cropped top and
 * bottom or letterboxed at the sides, and the picture that is cropped is the one
 * that goes everywhere this site is pasted.
 *
 * The square is kept: it is the right shape for an avatar and for the icon slots,
 * and `apple-icon.png` and friends are generated from the same artwork.
 *
 * ## What it draws
 *
 * The mark on the left at the height of the safe area, the wordmark and one line
 * of what the site is on the right, on `--void`. No card art: those images are
 * Bandai's, and this is the one picture that gets copied into every preview and
 * every search result — the single place where using theirs would read as a claim
 * to be them. The same reasoning is already written on the metadata in layout.tsx.
 *
 * The font is a condensed system stack rather than the site's Big Shoulders. A
 * webfont cannot be relied on inside librsvg, and a near-miss on letterforms in a
 * 1200px image is more obvious than an honest substitute.
 */

import path from 'node:path';
import sharp from 'sharp';

const W = 1200;
const H = 630;
const OUT = path.resolve('public', 'brand', 'share-1200x630.png');
const MARK = path.resolve('public', 'brand', 'share-1024.png');

/* Straight from globals.css, so the preview and the page it opens agree. */
const VOID = '#0a0c10';
const GLYPH = '#e6e0d2';
const GLYPH_DIM = '#79818f';
const RUNE = '#c0512e';

/** Breathing room the platforms are known to crop into on some layouts. */
const PAD = 64;
const MARK_SIZE = H - PAD * 2;

const escape = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function main() {
  const textLeft = PAD + MARK_SIZE + 56;

  const layer = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
       <rect width="${W}" height="${H}" fill="${VOID}"/>
       <!-- The accent rule the site draws under a section head. -->
       <rect x="${textLeft}" y="238" width="54" height="3" fill="${RUNE}"/>
       <text x="${textLeft}" y="212" font-family="Arial Narrow, Haettenschweiler, Impact, sans-serif"
             font-size="21" font-weight="600" letter-spacing="4.5" fill="${GLYPH_DIM}">
         ${escape('ONE PIECE CARD GAME ARCHIVE')}
       </text>
       <text x="${textLeft}" y="322" font-family="Arial Narrow, Haettenschweiler, Impact, sans-serif"
             font-size="86" font-weight="700" letter-spacing="4" fill="${GLYPH}">
         ${escape('PONEGLYPH')}
       </text>
       <text x="${textLeft}" y="386" font-family="Segoe UI, Helvetica, Arial, sans-serif"
             font-size="27" fill="${GLYPH_DIM}">
         ${escape('Every card, every printing, every result.')}
       </text>
       <text x="${textLeft}" y="424" font-family="Segoe UI, Helvetica, Arial, sans-serif"
             font-size="27" fill="${GLYPH_DIM}">
         ${escape('Unofficial fan project.')}
       </text>
     </svg>`
  );

  const mark = await sharp(MARK).resize(MARK_SIZE, MARK_SIZE).toBuffer();

  await sharp(layer)
    .composite([{ input: mark, left: PAD, top: PAD }])
    .png({ compressionLevel: 9 })
    .toFile(OUT);

  const { width, height, size } = await sharp(OUT).metadata();
  console.log(`[share] ${path.relative(process.cwd(), OUT)} — ${width}x${height}, ${Math.round((size ?? 0) / 1024)} KB`);

  if (width !== W || height !== H) {
    console.error(`[share] expected ${W}x${H}`);
    process.exit(1);
  }

  await refuseOverflow();
}

/**
 * Refuse an image whose text runs off the edge.
 *
 * The first render of this cut the eyebrow at "…CARD GAME ARC", because a string
 * at a chosen letter-spacing either fits the space left of the frame or does not
 * and nothing in an SVG says which. A font substitution on another machine moves
 * that line again. So the picture is measured rather than looked at: the outer
 * columns and rows have to be the background they were painted, and anything
 * touching them means a glyph left the frame.
 */
async function refuseOverflow() {
  const edge = 8;
  const { data, info } = await sharp(OUT).raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => {
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  /* The background it was painted, read from the picture rather than re-parsed. */
  const [br, bg, bb] = at(edge, Math.floor(info.height / 2));

  const strays = [];
  for (let y = 0; y < info.height; y++) {
    for (const x of [info.width - 1, info.width - edge]) {
      const [r, g, b] = at(x, y);
      if (Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb) > 12) strays.push(`${x},${y}`);
    }
  }
  if (strays.length) {
    console.error(
      `[share] something reaches the right edge at ${strays.length} pixels ` +
        `(first ${strays[0]}) — shorten the line or reduce its letter-spacing`
    );
    process.exit(1);
  }
  console.log(`[share] nothing within ${edge}px of the right edge`);
}

main().catch((err) => {
  console.error(`[share] ${err.message}`);
  process.exit(1);
});
