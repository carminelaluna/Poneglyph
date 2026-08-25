import Link from 'next/link';
import CardTile from '@/components/CardTile';
import { pigment } from '@/lib/colors';
import {
  art,
  artSrcSet,
  CARD_COLORS,
  cards,
  colorSpectrum,
  getSetCards,
  meta,
  sets,
} from '@/lib/cards';

/** One showcase card per colour: a recent Leader, in its best art. */
function heroCards() {
  return CARD_COLORS.map((color) => {
    const pool = cards.filter(
      (c) => c.category === 'Leader' && c.colors.length === 1 && c.colors[0] === color
    );
    const pick = pool[pool.length - 1] ?? pool[0];
    if (!pick) return null;
    const printing = pick.printings.find((p) => p.variant !== 'Regular') ?? pick.printings[0];
    return { card: pick, artId: printing?.id ?? pick.id };
  }).filter(Boolean) as { card: (typeof cards)[number]; artId: string }[];
}

export default function HomePage() {
  const spectrum = colorSpectrum();
  const heroes = heroCards();
  const newest = sets.find((s) => s.group === 'Booster Set');
  const newestCards = newest ? getSetCards(newest.code).slice(0, 12) : [];
  const boosters = sets.filter((s) => s.group === 'Booster Set').slice(0, 8);

  return (
    <>
      <section className="shell hero">
        <div>
          <p className="eyebrow">The ONE PIECE CARD GAME archive</p>
          <h1 className="display">
            <span className="hero-line">
              <span>Every card,</span>
            </span>
            <span className="hero-line">
              <span>carved in stone.</span>
            </span>
          </h1>
          <p className="hero-sub">
            Search {meta.counts.cards.toLocaleString('en-US')} cards by colour, cost, power,
            counter, attribute, trait, keyword, rarity and set — with the full rules text and
            every alternate art on record.
          </p>

          <div className="hero-stats">
            <div className="hero-stat">
              <b>{meta.counts.cards.toLocaleString('en-US')}</b>
              <span>Cards</span>
            </div>
            <div className="hero-stat">
              <b>{meta.counts.printings.toLocaleString('en-US')}</b>
              <span>Printings</span>
            </div>
            <div className="hero-stat">
              <b>{meta.counts.sets}</b>
              <span>Sets</span>
            </div>
            <div className="hero-stat">
              <b>{meta.counts.traits}</b>
              <span>Traits</span>
            </div>
          </div>

          <p style={{ marginTop: '2rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link
              href="/cards"
              className="chip"
              style={{
                padding: '0.6rem 1.15rem',
                fontSize: '0.74rem',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                background: 'var(--slab-lift)',
                borderColor: 'var(--edge-strong)',
                color: 'var(--glyph)',
              }}
            >
              Search the archive
            </Link>
            <Link
              href="/sets"
              className="chip"
              style={{
                padding: '0.6rem 1.15rem',
                fontSize: '0.74rem',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}
            >
              Browse sets
            </Link>
          </p>
        </div>

        <div className="hero-fan" aria-hidden="true">
          {heroes.map(({ card, artId }) => (
            <figure key={card.id}>
              <img src={art(artId, 320)} srcSet={artSrcSet(artId)} sizes="(max-width: 620px) 30vw, 160px" alt="" loading="eager" decoding="async" />
            </figure>
          ))}
        </div>
      </section>

      {/* Signature: the six pigments, sized by how much of the card pool each holds. */}
      <section className="shell section" style={{ paddingTop: 0 }}>
        <div className="section-head">
          <h2 className="display">The six colours</h2>
          <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
            Segment width is each colour&rsquo;s real share of the card pool
          </p>
        </div>
        <div className="spectrum">
          {spectrum.map((s) => (
            <Link
              key={s.color}
              href={`/cards?color=${s.color}`}
              className="spectrum-seg"
              style={
                {
                  '--seg': pigment(s.color),
                  flexGrow: s.count,
                  flexBasis: 0,
                } as React.CSSProperties
              }
            >
              <b>{s.color}</b>
              <span>{s.count.toLocaleString('en-US')}</span>
            </Link>
          ))}
        </div>
      </section>

      {newest && newestCards.length > 0 ? (
        <section className="shell section" style={{ paddingTop: 0 }}>
          <div className="section-head">
            <h2 className="display">
              Newest set — {newest.code} {newest.name}
            </h2>
            <Link href={`/sets/${newest.slug}`} className="muted" style={{ fontSize: '0.8rem' }}>
              All {newest.cardCount} cards →
            </Link>
          </div>
          <div className="card-grid">
            {newestCards.map((c) => (
              <CardTile key={c.id} card={c} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="shell section" style={{ paddingTop: 0 }}>
        <div className="section-head">
          <h2 className="display">Booster sets</h2>
          <Link href="/sets" className="muted" style={{ fontSize: '0.8rem' }}>
            All {meta.counts.sets} sets →
          </Link>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {boosters.map((s) => (
            <Link key={s.id} href={`/sets/${s.slug}`} className="slab slab-pad">
              <p className="mono" style={{ margin: 0, fontSize: '0.7rem', color: 'var(--glyph-faint)' }}>
                {s.code}
              </p>
              <p style={{ margin: '0.25rem 0 0.6rem', fontWeight: 500 }}>{s.name}</p>
              <p className="mono muted" style={{ margin: 0, fontSize: '0.72rem' }}>
                {s.cardCount} cards · {s.printingCount} printings
              </p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
