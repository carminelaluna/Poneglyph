import type { Metadata } from 'next';
import Link from 'next/link';
import { meta, sets } from '@/lib/cards';

export const metadata: Metadata = {
  title: 'Sets',
  description: `All ${meta.counts.sets} ONE PIECE CARD GAME sets — booster sets, extra boosters, premium boosters, starter decks and promos, with card counts.`,
};

const GROUP_ORDER = [
  'Booster Set',
  'Extra Booster',
  'Premium Booster',
  'Starter Deck',
  'Promo',
  'Other',
];

export default function SetsPage() {
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: sets.filter((s) => s.group === group),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="shell" style={{ paddingBlock: '2rem 3rem' }}>
      <p className="eyebrow">Sets</p>
      <h1 className="display" style={{ fontSize: 'clamp(1.6rem, 3.2vw, 2.3rem)', margin: '0.5rem 0 0' }}>
        Every product on record
      </h1>
      <p className="muted" style={{ maxWidth: '58ch', marginTop: '0.75rem' }}>
        {meta.counts.sets} sets holding {meta.counts.cards.toLocaleString('en-US')} distinct cards
        and {meta.counts.printings.toLocaleString('en-US')} printings.
      </p>

      {grouped.map(({ group, items }) => (
        <section key={group} className="section" style={{ paddingBottom: 0 }}>
          <div className="section-head">
            <h2 className="display">{group}</h2>
            <span className="muted mono" style={{ fontSize: '0.78rem' }}>
              {items.length}
            </span>
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th style={{ textAlign: 'right' }}>Cards</th>
                  <th style={{ textAlign: 'right' }}>Printings</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id}>
                    <td className="mono">
                      <Link href={`/sets/${s.slug}`}>{s.code}</Link>
                    </td>
                    <td>
                      <Link href={`/sets/${s.slug}`}>{s.name}</Link>
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {s.cardCount}
                    </td>
                    <td className="mono muted" style={{ textAlign: 'right' }}>
                      {s.printingCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
