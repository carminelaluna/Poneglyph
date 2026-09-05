import type { Metadata } from 'next';
import Link from 'next/link';
import history from '@data/price-history.json';
import { getCard } from '@/lib/cards';
import { movers, type Stored } from '@/lib/prices';
import PriceMovers from './PriceMovers';
import '../browse.css';
import '../decks.css';

/**
 * What moved, computed here rather than in the browser.
 *
 * `price-history.json` is 142 KB and reducing it to two windows of movers costs a
 * few hundred rows, so the whole page arrives with the HTML and fetches nothing —
 * the same trade the card page makes when it draws its chart as inline SVG at build
 * time instead of shipping the file to plot one line.
 *
 * It is regenerated on every build, and prices refresh twice a day, so this is never
 * more than a few hours behind whatever the source last said.
 */

/*
 * Through `unknown`, as the card page does: `resolveJsonModule` infers
 * `number[][]` for the pairs and TypeScript will not narrow that to a tuple on
 * its own. The shape is guaranteed by the writer, price-history.mjs.
 */
const stored = history as unknown as Stored;

export const metadata: Metadata = {
  title: 'Price movers',
  description:
    'Which ONE PIECE CARD GAME cards gained and lost the most, by percentage and in cash, over the last week and over everything on record. Lowest listed prices, with the days they actually changed.',
};

/**
 * The windows offered.
 *
 * Seven recorded days, and everything there is. Ninety is the cap the ingest keeps
 * and the second window grows into it — there is no point offering a thirty-day
 * view that silently answers with eleven days of data and does not say so.
 */
const WINDOWS = [
  { label: '7d', days: 7 },
  { label: 'All', days: Number.MAX_SAFE_INTEGER },
];

export default function PricesPage() {
  const days = stored.days ?? [];
  const recorded = days.length;

  const windows = WINDOWS.map(({ label, days: want }) => {
    const span = Math.min(want, Math.max(recorded - 1, 0));
    const first = days[Math.max(0, recorded - 1 - span)];
    const last = days[recorded - 1];
    return {
      label,
      days: span,
      span: first && last ? `${first} to ${last}` : 'nothing recorded yet',
      movers: movers(stored, span)
        .map((m) => {
          const card = getCard(m.id);
          return { ...m, name: card?.name ?? m.id, colors: card?.colors ?? [] };
        })
        /* A card the archive no longer lists cannot be linked to or named. */
        .filter((m) => m.name !== m.id || getCard(m.id)),
    };
  });

  return (
    <div className="shell" style={{ paddingBottom: '3rem' }}>
      <div style={{ paddingBlock: '2rem 0.5rem' }}>
        <p className="eyebrow">
          <Link href="/cards">Cards</Link> · Prices
        </p>
        <h1
          className="display"
          style={{ fontSize: 'clamp(1.7rem, 3.6vw, 2.6rem)', margin: '0.4rem 0 0' }}
        >
          What moved
        </h1>
      </div>

      {recorded < 2 ? (
        <p className="empty">
          Not enough price history yet — the ingest has recorded {recorded}{' '}
          {recorded === 1 ? 'day' : 'days'}, and a move needs two.
        </p>
      ) : (
        <PriceMovers windows={windows} />
      )}

      {/*
        The one thing a reader cannot work out from the table: how much history there
        is. Ninety days is the cap, and the series started when the ingest started —
        so "All" is however far back that reaches, which today is not far.
      */}
      <p className="muted source-line" style={{ maxWidth: '76ch', marginTop: '1.6rem' }}>
        {recorded} {recorded === 1 ? 'day' : 'days'} of history so far; the ingest keeps
        ninety and the window grows into it. Nothing is back-filled — the source publishes
        a price and a scrape date, not a history.{' '}
        <Link href="/data" className="inline-link">
          How the archive is built
        </Link>
        .
      </p>
    </div>
  );
}
