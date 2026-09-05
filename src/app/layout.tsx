import type { Metadata, Viewport } from 'next';
import { Big_Shoulders, Archivo, JetBrains_Mono } from 'next/font/google';
import BackToTop from '@/components/BackToTop';
import { Masthead } from '@/components/Chrome';
import Footer from '@/components/Footer';
import FirstVisitNotice from '@/components/FirstVisitNotice';
import { meta } from '@/lib/cards';
import './globals.css';

/*
 * A condensed industrial grotesque for the display role. The archive is full of
 * long strings — "THE WORLD'S STRONGEST WARRIORS", "There's No Authority in the
 * World That Lasts Forever!!!" — and a condensed face fits them on one line at
 * headline size while staying sharp down to 0.6rem table labels. Its flat-sided,
 * stencil-adjacent cut keeps the carved reading without the medieval baggage.
 */
const display = Big_Shoulders({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

/* A sturdy grotesque that stays readable in dense stat tables. */
const body = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

/* Card codes and power values are data — they get a monospace of their own. */
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

/*
 * Where the site actually is, for the absolute URLs metadata needs.
 *
 * This was pinned to poneglyph.gg, a domain that is not in use, so the share image
 * below would have resolved against a host that does not serve it. It reads the same
 * variable the sitemap and robots.txt do.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://poneglyph.gg';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'Poneglyph — ONE PIECE CARD GAME archive',
    template: '%s · Poneglyph',
  },
  description: `Search every ONE PIECE CARD GAME card by colour, cost, power, counter, attribute, trait, keyword, rarity and set. ${meta.counts.cards.toLocaleString('en-US')} cards, ${meta.counts.printings.toLocaleString('en-US')} printings. Unofficial fan project, not affiliated with Bandai.`,
  keywords: ['One Piece Card Game', 'OPTCG', 'card database', 'card list', 'Leader', 'TCG'],
  openGraph: {
    title: 'Poneglyph — ONE PIECE CARD GAME archive',
    description: 'Every card, every printing, every stat. An unofficial fan archive.',
    type: 'website',
    /*
     * The mark, not card art. Card images are Bandai's and this is the picture that
     * gets copied into every link preview, chat unfurl and search result — the one
     * place where using theirs would look like a claim to be them.
     *
     * 1200x630, because that is what every unfurl is built for. It was the square
     * 1024 until an audit noticed: a square is cropped top and bottom or
     * letterboxed at the sides by every platform that shows it. The square is still
     * the right shape for an avatar, so it stays in the folder — it is simply not
     * what a link preview should be handed. Built by scripts/build-share-image.mjs.
     */
    images: [
      { url: '/brand/share-1200x630.png', width: 1200, height: 630, alt: 'Poneglyph' },
    ],
  },
  /*
   * Without this Twitter shows a small square thumbnail beside the text and the
   * 1200x630 is wasted on the one platform most likely to be handed it.
   */
  twitter: {
    card: 'summary_large_image',
    title: 'Poneglyph — ONE PIECE CARD GAME archive',
    description: 'Every card, every printing, every stat. An unofficial fan archive.',
    images: ['/brand/share-1200x630.png'],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#0a0c10',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <Masthead />
        <main>{children}</main>
        <Footer />
        {/* Once, to a reader who has not read it. See the component. */}
        <FirstVisitNotice />
        <BackToTop />
      </body>
    </html>
  );
}
