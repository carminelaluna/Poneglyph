import type { Metadata, Viewport } from 'next';
import { Big_Shoulders, Archivo, JetBrains_Mono } from 'next/font/google';
import { Masthead } from '@/components/Chrome';
import Footer from '@/components/Footer';
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

export const metadata: Metadata = {
  metadataBase: new URL('https://poneglyph.gg'),
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
      </body>
    </html>
  );
}
