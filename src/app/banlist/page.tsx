import type { Metadata } from 'next';
import Link from 'next/link';
import banlistJson from '@data/banlist.json';
import { art } from '@/lib/cards';
import { pigment } from '@/lib/colors';

type Entry = {
  id: string;
  name: string | null;
  colors: string[];
  category: string | null;
  setCode: string | null;
  blockNumber: number | null;
  standardLegal: boolean | null;
  known: boolean;
};

type Banlist = {
  generatedAt: string;
  effectiveFrom: string | null;
  source: { label: string; url: string; home: string };
  counts: { banned: number; restricted: number; pairs: number };
  banned: Entry[];
  restricted: Entry[];
  pairs: [Entry, Entry][];
};

const banlist = banlistJson as unknown as Banlist;

export const metadata: Metadata = {
  title: 'Banned & restricted',
  description:
    'The current ONE PIECE CARD GAME banned and restricted list, including banned card pairs, taken from the official rules page.',
};

export default function BanlistPage() {
  const { banned, restricted, pairs, effectiveFrom, source } = banlist;

  return (
    <div className="shell" style={{ paddingBlock: '2rem 3rem' }}>
      <p className="eyebrow">Rules</p>
      <h1
        className="display"
        style={{ fontSize: 'clamp(1.7rem, 3.4vw, 2.5rem)', margin: '0.5rem 0 0' }}
      >
        Banned &amp; restricted
      </h1>
      <p className="muted" style={{ maxWidth: '64ch', marginTop: '0.8rem' }}>
        {effectiveFrom ? (
          <>
            In effect since <strong style={{ color: 'var(--glyph)' }}>{effectiveFrom}</strong>.{' '}
          </>
        ) : null}
        Alternate arts count as the same card — a ban applies to every printing of it.
      </p>

      <div className="notice">
        <p style={{ margin: 0 }}>
          Taken from{' '}
          <a href={source.url} target="_blank" rel="noreferrer noopener">
            the official rules page
          </a>
          . Poneglyph is not a source of rulings — if this page and Bandai disagree, Bandai is
          right. Restrictions apply to both Standard and Extra unless stated otherwise.
        </p>
      </div>

      <Section
        title="Banned"
        blurb="Cannot be included in any deck."
        count={banned.length}
        empty="No cards are banned right now."
      >
        <div className="card-grid">
          {banned.map((card) => (
            <BanCard key={card.id} card={card} />
          ))}
        </div>
      </Section>

      <Section
        title="Restricted"
        blurb="Limited to a reduced number of copies."
        count={restricted.length}
        empty="No cards are restricted right now."
      >
        <div className="card-grid">
          {restricted.map((card) => (
            <BanCard key={card.id} card={card} />
          ))}
        </div>
      </Section>

      <Section
        title="Banned pairs"
        blurb="Each pair cannot appear in the same deck. Either card alone is fine."
        count={pairs.length}
        empty="No banned pairs right now."
      >
        <div className="pair-list">
          {pairs.map(([a, b]) => (
            <div key={`${a.id}+${b.id}`} className="pair">
              <BanCard card={a} />
              <span className="pair-join" aria-label="cannot be played with">
                +
              </span>
              <BanCard card={b} />
            </div>
          ))}
        </div>
      </Section>

      <p className="muted" style={{ fontSize: '0.76rem', marginTop: '2.5rem', maxWidth: '74ch' }}>
        A card marked <em>Extra only</em> has already rotated out of Standard on block, so its
        restriction only changes what is legal in{' '}
        <Link href="/cards?format=Extra">Extra / Grand Battle</Link>.
      </p>
    </div>
  );
}

function Section({
  title,
  blurb,
  count,
  empty,
  children,
}: {
  title: string;
  blurb: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section" style={{ paddingBottom: 0 }}>
      <div className="section-head">
        <h2 className="display">
          {title} <span className="muted">— {count}</span>
        </h2>
        <span className="muted" style={{ fontSize: '0.78rem' }}>
          {blurb}
        </span>
      </div>
      {count === 0 ? <p className="muted">{empty}</p> : children}
    </section>
  );
}

function BanCard({ card }: { card: Entry }) {
  const inner = (
    <>
      <div className="tile-art">
        <img src={art(card.id, 320)} alt={card.name ?? card.id} loading="lazy" />
      </div>
      <div className="tile-meta">
        {card.colors.length > 0 ? (
          <span className="pips">
            {card.colors.map((c) => (
              <i key={c} className="pip" style={{ '--pip': pigment(c) } as React.CSSProperties} />
            ))}
          </span>
        ) : null}
        <span className="tile-name">{card.name ?? card.id}</span>
      </div>
      <div className="tile-meta" style={{ marginTop: '0.1rem' }}>
        <span className="tile-code">{card.id}</span>
        {card.standardLegal === false ? (
          <span className="tile-code" style={{ marginLeft: 'auto', color: 'var(--rune-lit)' }}>
            Extra only
          </span>
        ) : null}
      </div>
    </>
  );

  if (!card.known) {
    return (
      <div className="tile" title="Not in the card archive yet">
        {inner}
      </div>
    );
  }
  return (
    <Link
      href={`/cards/${card.id.toLowerCase()}`}
      className="tile"
      style={{ '--pigment': pigment(card.colors[0] ?? '') } as React.CSSProperties}
    >
      {inner}
    </Link>
  );
}
