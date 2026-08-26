import Link from 'next/link';
import CardTile from '@/components/CardTile';
import regionsJson from '@data/regions.json';
import { pigment } from '@/lib/colors';
import {
  art,
  artSrcSet,
  cards,
  colorSpectrum,
  getSetCards,
  meta,
  sets,
} from '@/lib/cards';

/** When each set arrived, newest first — see the note in build-indexes.mjs. */
const releases = (regionsJson as { releases?: { code: string; from: string }[] }).releases ?? [];

/**
 * The six most recently released Leaders, in their best art.
 *
 * This used to be one Leader per colour, taken as the last match in `cards` — but
 * that array is ordered by card number, not by release, so "last" meant the highest
 * starter-deck number and the fan showed three different Monkey.D.Luffy.
 *
 * `data/regions.json` carries a dated, newest-first list of set releases, derived
 * from when each set first appeared in recorded results. Those are **play dates
 * rather than print dates** — near enough for "what is new", and the honest thing to
 * call it, which is why nothing on the page claims a release date.
 */
function heroCards() {
  const picked: { card: (typeof cards)[number]; artId: string }[] = [];
  const seen = new Set<string>();

  for (const release of releases) {
    /* Within one set, low card numbers first — Leaders are numbered from 001. */
    const leaders = cards
      .filter((c) => c.category === 'Leader' && c.setCode === release.code)
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const leader of leaders) {
      /* The same Leader can be reprinted; show each name once. */
      if (seen.has(leader.name)) continue;
      seen.add(leader.name);

      const printing =
        leader.printings.find((p) => p.variant !== 'Regular') ?? leader.printings[0];
      picked.push({ card: leader, artId: printing?.id ?? leader.id });
      if (picked.length === 6) return picked;
    }
  }

  /*
   * A set with no recorded results yet has no date, so it is not in `releases` and
   * its Leaders are missed. Fill from the card archive rather than showing a short
   * fan — this only bites on a checkout with no deck data at all.
   */
  for (const card of cards) {
    if (picked.length === 6) break;
    if (card.category !== 'Leader' || seen.has(card.name)) continue;
    seen.add(card.name);
    const printing = card.printings.find((p) => p.variant !== 'Regular') ?? card.printings[0];
    picked.push({ card, artId: printing?.id ?? card.id });
  }

  return picked;
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
