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

type Announced = {
  effectiveFrom: string | null;
  announcedAt: string | null;
  banned: Entry[];
  restricted: Entry[];
  pairs: [Entry, Entry][];
};

type Banlist = {
  generatedAt: string;
  effectiveFrom: string | null;
  announced?: Announced | null;
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
  const { banned, restricted, pairs, announced, effectiveFrom, source } = banlist;

  return (
    <div className="shell" style={{ paddingBlock: '2rem 3rem' }}>
      <p className="eyebrow">Rules</p>
      <h1
        className="display"
        style={{ fontSize: 'clamp(1.7rem, 3.4vw, 2.5rem)', margin: '0.5rem 0 0' }}
      >
        Banned &amp; restricted
      </h1>

      {announced ? (
        <section className="section" style={{ paddingBottom: 0 }}>
          <div className="section-head">
            <h2 className="display">
              Changing{' '}
              <span className="muted">
                {announced.effectiveFrom
                  ? `— from ${announced.effectiveFrom}`
                  : '— on a date not yet given'}
              </span>
            </h2>
          </div>
          <p className="muted" style={{ maxWidth: '74ch', margin: '0 0 1rem' }}>
            Not in force yet — everything below this panel is what applies today.
            {announced.announcedAt ? ` Announced on ${announced.announcedAt}.` : ''} The official
            rules page lists the additions; the whole change, removals included, is in Bandai&rsquo;s
            own announcement.
          </p>
          <Group label="To be banned" cards={announced.banned} />
          <Group label="To be restricted" cards={announced.restricted} />
          {announced.pairs.length > 0 ? (
            <div className="pair-list">
              {announced.pairs.map(([a, b]) => (
                <div key={`${a.id}+${b.id}`} className="pair">
                  <BanCard card={a} />
                  <span className="pair-join" aria-label="cannot be played with">
                    +
                  </span>
                  <BanCard card={b} />
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <Section
        title="Banned"
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

      <p className="muted source-line" style={{ maxWidth: '74ch', marginTop: '1.2rem' }}>
        {effectiveFrom ? `In force since ${effectiveFrom}. ` : ''}
        Read from{' '}
        <a href={source.url} target="_blank" rel="noreferrer noopener">
          {source.label}
        </a>
        .
      </p>
    </div>
  );
}

function Group({ label, cards }: { label: string; cards: Entry[] }) {
  if (cards.length === 0) return null;
  return (
    <>
      <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.78rem' }}>
        {label}
      </p>
      <div className="card-grid" style={{ marginBottom: '1rem' }}>
        {cards.map((card) => (
          <BanCard key={card.id} card={card} />
        ))}
      </div>
    </>
  );
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
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
