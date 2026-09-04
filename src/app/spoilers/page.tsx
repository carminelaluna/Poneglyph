import type { Metadata } from 'next';
import Link from 'next/link';
import spoilersJson from '@data/spoilers.json';
import { asset } from '@/lib/paths';

type SpoilerCard = {
  id: string;
  name: string | null;
  image: string | null;
  /** A local 320px thumbnail, when the reveal came from Discord — see asset(). */
  thumb?: string | null;
  /** What the card does, when the reveal came with somebody's translation. */
  text?: string | null;
};
type SpoilerSet = {
  set: string;
  code: string;
  release: string | null;
  kind: string;
  revealed: number;
  cards: SpoilerCard[];
  articles: { title: string; url: string; date: string }[];
  lastCoverage: string | null;
};
type ReleasedSet = {
  set: string;
  code: string;
  name: string | null;
  cards: number;
  slug: string;
  lastCoverage: string;
};

type Spoilers = {
  generatedAt: string;
  source: { id: string; label: string; home: string; category: string };
  counts: { sets: number; cards: number; named: number; articles: number };
  sets: SpoilerSet[];
  released: ReleasedSet[];
};

const spoilers = spoilersJson as Spoilers;

export const metadata: Metadata = {
  title: 'Spoilers',
  description:
    'ONE PIECE CARD GAME sets that have not shipped yet: revealed card numbers, release windows, and where the reveals came from.',
};

export default function SpoilersPage() {
  const { sets, source, counts } = spoilers;
  const released = spoilers.released ?? [];
  const updated = new Date(spoilers.generatedAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="shell" style={{ paddingBlock: '2rem 3rem' }}>
      <p className="eyebrow">Spoilers</p>
      <h1
        className="display"
        style={{ fontSize: 'clamp(1.7rem, 3.4vw, 2.5rem)', margin: '0.5rem 0 0' }}
      >
        What is coming next
      </h1>
      {sets.length === 0 ? (
        <p className="empty">No unreleased sets are being covered right now.</p>
      ) : (
        sets.map((set) => (
          <section key={set.set} className="section" style={{ paddingBottom: 0 }}>
            <div className="section-head">
              <h2 className="display">
                {set.code} <span className="muted">— {set.kind}</span>
              </h2>
              <span className="muted mono" style={{ fontSize: '0.78rem' }}>
                {set.release ?? 'release date unknown'} · {set.revealed} card
                {set.revealed === 1 ? '' : 's'} revealed
              </span>
            </div>

            {set.cards.length > 0 ? (
              <div className="spoiler-grid">
                {set.cards.map((card) => {
                  /* Ours if we kept a thumbnail, the source's if we only linked one. */
                  const source = card.thumb ? asset(`/spoilers/${card.thumb}`) : card.image;
                  return (
                    <figure key={card.id} className="spoiler-card">
                      {/*
                        A card number with no picture is still a reveal, and most of
                        them are: the Discord source carries the numbers within
                        minutes but its image links are signed and expire in hours,
                        so nothing points at one. A broken image is worse than an
                        honest empty frame, which is what this is.
                      */}
                      {card.image || card.thumb ? (
                        /*
                          The picture opens itself, in a tab of its own. A reveal is
                          drawn a few centimetres wide in this grid and the thing a
                          reader wants next is a closer look — which for these is the
                          file, since there is no card page to send them to until the
                          set ships.

                          A new tab rather than a navigation: leaving the page to
                          look at one card, then coming back to find the grid where
                          you left it, is the interaction this is instead of.
                        */
                        <a
                          href={source!}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="spoiler-open"
                          aria-label={`Open the full image of ${card.name ?? card.id}`}
                        >
                          <img
                            /*
                              `asset()` and not a bare path: this site is served under
                              a basePath, and a hand-written src is one of the two
                              things Next does not rewrite.
                            */
                            src={source!}
                            alt={card.name ? `${card.name} (${card.id})` : card.id}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        </a>
                      ) : (
                        <span className="spoiler-blank" aria-hidden="true" />
                      )}
                      <figcaption>
                        <b>{card.name ?? 'Name not listed'}</b>
                        <span className="mono">{card.id}</span>
                      </figcaption>
                      {/*
                        Only when there is one. A reveal that is already in English
                        does not come with a translation, so most of these are the
                        Japanese ones, and this is the only place on the site that
                        says what an unreleased card does.
                      */}
                      {card.text ? <p className="spoiler-text">{card.text}</p> : null}
                    </figure>
                  );
                })}
              </div>
            ) : (
              <p className="muted">Announced, but no card images have surfaced yet.</p>
            )}
          </section>
        ))
      )}

      {released.length > 0 ? (
        <section className="section" style={{ paddingBottom: 0 }}>
          <div className="section-head">
            <h2 className="display">
              Now released <span className="muted">— {released.length}</span>
            </h2>
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              Revealed here, now complete in the archive
            </span>
          </div>
          <div className="released-grid">
            {released.map((set) => (
              <Link key={set.set} href={`/sets/${set.slug}`} className="slab slab-pad released-card">
                <p className="mono" style={{ margin: 0, fontSize: '0.7rem', color: 'var(--glyph-faint)' }}>
                  {set.code}
                </p>
                <p style={{ margin: '0.25rem 0 0.5rem', fontWeight: 500 }}>
                  {set.name ?? set.code}
                </p>
                <p className="mono muted" style={{ margin: 0, fontSize: '0.72rem' }}>
                  {set.cards} cards · revealed {set.lastCoverage.slice(0, 10)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/*
        The header used to carry two paragraphs and now carries none. What could not
        simply go is that these are somebody else's images of cards that are not out
        — attribution and "may change" are the reason the page is allowed to show
        them at all — so it says that here, once, at the foot, instead of twice at
        the top where it was the first thing in the way.
      */}
      <p className="muted" style={{ fontSize: '0.76rem', marginTop: '2.5rem', maxWidth: '74ch' }}>
        Community reveals, not official releases: read from{' '}
        <a href={source.home} target="_blank" rel="noreferrer noopener" className="inline-link">
          {source.label}
        </a>
        &rsquo;s {source.category} coverage, shown with their images, and liable to change
        before a set ships. {counts.cards} card{counts.cards === 1 ? '' : 's'} across{' '}
        {counts.sets} unreleased set{counts.sets === 1 ? '' : 's'}, from {counts.articles}{' '}
        article{counts.articles === 1 ? '' : 's'}. Last checked {updated}. A set moves to{' '}
        <Link href="/sets">Sets</Link> with its full card data as soon as its cards reach the
        official card list — this page tracks that handover rather than requiring an edit.
      </p>
    </div>
  );
}
