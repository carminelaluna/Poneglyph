import type { Metadata, Viewport } from 'next';
import { Big_Shoulders, Archivo, JetBrains_Mono } from 'next/font/google';
import BackToTop from '@/components/BackToTop';
import { Masthead } from '@/components/Chrome';
import Footer from '@/components/Footer';
import FirstVisitNotice from '@/components/FirstVisitNotice';
import { meta } from '@/lib/cards';
import './globals.css';

const display = Big_Shoulders({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const body = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://poneglyph.gg';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'Poneglyph — ONE PIECE CARD GAME archive',
    template: '%s · Poneglyph',
  },
  description: `Search ${meta.counts.cards.toLocaleString('en-US')} ONE PIECE CARD GAME cards and ${meta.counts.printings.toLocaleString('en-US')} printings by colour, cost, power, counter, trait and set, with the metagame beside them.`,
  keywords: ['One Piece Card Game', 'OPTCG', 'card database', 'card list', 'Leader', 'TCG'],
  openGraph: {
    title: 'Poneglyph — ONE PIECE CARD GAME archive',
    description: 'Every card, every printing, every stat. An unofficial fan archive.',
    type: 'website',
    images: [
      { url: '/brand/share-1200x630.png', width: 1200, height: 630, alt: 'Poneglyph' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Poneglyph — ONE PIECE CARD GAME archive',
    description: 'Every card, every printing, every stat. An unofficial fan archive.',
    images: ['/brand/share-1200x630.png'],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: './' },
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
        <FirstVisitNotice />
        <BackToTop />
      </body>
    </html>
  );
}
