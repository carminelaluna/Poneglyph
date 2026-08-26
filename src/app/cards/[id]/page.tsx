import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import CardTile, { ColorPips } from '@/components/CardTile';
import CardViewer from '@/components/CardViewer';
import RulesText from '@/components/RulesText';
import { art, cards, filters, formatPrice, formatPower, getCard } from '@/lib/cards';
import { cardArchetypes, getPlay, hasDeckData } from '@/lib/decks';
import { MIN_POINTS, priceMove, readSeries, sparkline, type Stored } from '@/lib/prices';
import priceHistory from '@data/price-history.json';
import { pigment } from '@/lib/colors';
import '../../card.css';
import '../../decks.css';

type Params = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return cards.map((card) => ({ id: card.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const card = getCard(id);
  if (!card) return { title: 'Card not found' };

  const line = [
    card.category,
    card.colors.join('/'),
    card.power ? `${formatPower(card.power)} power` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    title: `${card.name} (${card.id})`,
    description: `${card.name} — ${line}. ${card.effect ?? ''} From ${card.setCode} ${card.setName}.`.trim(),
    openGraph: { images: [{ url: art(card.id) }] },
  };
}

export default async function CardPage({ params }: Params) {
  const { id } = await params;
  const card = getCard(id);
  if (!card) notFound();

  const isLeader = card.category === 'Leader';
  const cheapest = card.printings
    .map((p) => p.price?.market)
    .filter((n): n is number => typeof n === 'number');

  /*
   * "See also" anchors on the card's most specific trait. Anchoring on the first
   * one would pull in every Straw Hat Crew card for a Supernova, so the trait with
   * the fewest cards overall wins — it is the one that says something.
   */
  const traitSize = new Map(filters.types.map((t) => [String(t.value), t.count]));
  const anchor = [...card.types].sort(
    (a, b) => (traitSize.get(a) ?? Infinity) - (traitSize.get(b) ?? Infinity)
  )[0];

  /* How the competitive field actually uses this card, if deck data has been ingested. */
  /* Build-time, from data/price-history.json — the browser fetches nothing. */
  const series = readSeries(priceHistory as unknown as Stored, card.id);
  const move = priceMove(series);

  const play = hasDeckData ? getPlay(card.id) : null;
  const playedBy = play ? cardArchetypes(card.id, 6) : [];

  const related = anchor
    ? cards
        .filter(
          (other) =>
            other.id !== card.id &&
            other.types.includes(anchor) &&
            other.colors.some((c) => card.colors.includes(c))
        )
        .slice(0, 12)
    : [];

  return (
    <>
      <div className="shell card-page">
        <CardViewer cardId={card.id} name={card.name} printings={card.printings} />

        <div>
          <div className="card-head">
            <p className="eyebrow">
              <Link href={`/sets/${card.setCode.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                {card.setCode} · {card.setName}
              </Link>
            </p>
            <h1 className="display">{card.name}</h1>
            <div className="card-line">
              <ColorPips colors={card.colors} />
              <span>{card.colors.join(' / ')}</span>
              <span className="dot">·</span>
              <span>{card.category}</span>
              <span className="dot">·</span>
              <span className="mono">{card.id}</span>
              <span className="dot">·</span>
              <span>{card.rarity}</span>
              {card.blockNumber !== null ? (
                <>
                  <span className="dot">·</span>
                  <span>Block {card.blockNumber}</span>
                </>
              ) : null}
              <span className="dot">·</span>
              <span
                className={card.standardLegal ? 'legal-yes' : 'legal-no'}
                title={
                  card.legalBy === 'block-update'
                    ? 'Block 1, but Bandai keeps this card number legal in Standard'
                    : card.standardLegal
                      ? 'Legal in Standard and in Extra / Grand Battle'
                      : 'Rotated out of Standard — still legal in Extra / Grand Battle'
                }
              >
                {card.standardLegal ? 'Standard + Extra' : 'Extra only'}
              </span>
              {card.legalBy === 'block-update' ? (
                <>
                  <span className="dot">·</span>
                  <span className="muted" style={{ fontSize: '0.78rem' }}>
                    kept legal by block update
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <dl className="stats">
            {isLeader ? (
              <Stat label="Life" value={card.life} />
            ) : (
              <Stat label="Cost" value={card.cost} />
            )}
            <Stat label="Power" value={card.power} format={formatPower} />
            <Stat label="Counter" value={card.counter} format={(n) => `+${formatPower(n)}`} />
            <div className="stat">
              <dt>Attribute</dt>
              <dd className={`small${card.attributes.length ? '' : ' none'}`}>
                {card.attributes.join(' / ') || '—'}
              </dd>
            </div>
            <div className="stat">
              <dt>Printings</dt>
              <dd>{card.printingCount}</dd>
            </div>
            <div className="stat">
              <dt>Market</dt>
              <dd className={`small${cheapest.length ? '' : ' none'}`}>
                {cheapest.length
                  ? cheapest.length > 1
                    ? `${formatPrice(Math.min(...cheapest))} – ${formatPrice(Math.max(...cheapest))}`
                    : formatPrice(cheapest[0])
                  : 'No price'}
              </dd>
            </div>
          </dl>

          <div className="rules">
            <RulesText text={card.effect} />
          </div>

          {play ? (
            <div className="meta-block">
              <h2>Tournament play</h2>
              <p className="muted" style={{ fontSize: '0.76rem', margin: '0 0 0.7rem' }}>
                Across every recorded deck. Pick a time window on{' '}
                <Link href="/decks">the metagame page</Link> to see how these shift.
              </p>
              <dl className="stats" style={{ marginTop: 0 }}>
                <div className="stat">
                  <dt>Of all decks</dt>
                  <dd>{play.share.toFixed(1)}%</dd>
                </div>
                <div className="stat">
                  <dt>Decks</dt>
                  <dd>{play.decks.toLocaleString('en-US')}</dd>
                </div>
                <div className="stat">
                  <dt>Copies</dt>
                  <dd>{play.avgCopies.toFixed(1)}&times;</dd>
                </div>
                <div className="stat">
                  <dt>Archetypes</dt>
                  <dd>{play.archetypes}</dd>
                </div>
              </dl>

              {playedBy.length ? (
                <div className="table-scroll" style={{ marginTop: '0.9rem' }}>
                  <table className="meta-table">
                    <thead>
                      <tr>
                        <th>Played in</th>
                        <th>Inclusion</th>
                        <th style={{ textAlign: 'right' }}>Copies</th>
                        <th style={{ textAlign: 'right' }}>Decks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {playedBy.map((row) => (
                        <tr key={row.archetype.leaderId}>
                          <td>
                            <Link href={`/decks/${row.archetype.slug}`} className="meta-leader">
                              <img src={art(row.archetype.leaderId, 96)} alt="" loading="lazy" />
                              <span style={{ minWidth: 0 }}>
                                <span className="meta-leader-name" style={{ display: 'block' }}>
                                  {row.archetype.name}
                                </span>
                                <span className="meta-leader-id">{row.archetype.leaderId}</span>
                              </span>
                            </Link>
                          </td>
                          <td>
                            <div
                              className="share-bar"
                              style={
                                {
                                  '--share': `${row.inclusion}%`,
                                  '--pigment': pigment(row.archetype.colors[0] ?? ''),
                                } as React.CSSProperties
                              }
                            >
                              <i />
                              <span>{row.inclusion.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="mono" style={{ textAlign: 'right' }}>
                            {row.avgCopies.toFixed(1)}&times;
                          </td>
                          <td className="mono muted" style={{ textAlign: 'right' }}>
                            {row.decks}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}

          {card.trigger ? (
            <div className="trigger">
              <span className="eyebrow">Trigger</span>
              <RulesText text={card.trigger} />
            </div>
          ) : null}

          {card.types.length ? (
            <div className="meta-block">
              <h2>Traits</h2>
              <div className="chip-row">
                {card.types.map((t) => (
                  <Link key={t} href={`/cards?trait=${encodeURIComponent(t)}`} className="chip chip-link">
                    {t}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {/*
            What the price has done, which the archive could not say at all until
            it started keeping a series: a price was one number, overwritten twice
            a day. Nothing is back-filled, so a card the ingest has only seen once
            says so rather than drawing a flat line that reads as a steady price.
          */}
          <div className="meta-block">
            <h2>Price</h2>
            {move && series.length >= MIN_POINTS ? (
              <>
                <div className="price-line">
                  <svg
                    className="price-spark"
                    viewBox="0 0 120 32"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label={`${formatPrice(move.from)} on ${series[0].day}, ${formatPrice(move.to)} on ${series[series.length - 1].day}`}
                  >
                    <path d={sparkline(series)} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <span className={`price-move${move.delta > 0 ? ' up' : move.delta < 0 ? ' down' : ''}`}>
                    {move.delta > 0 ? '+' : ''}
                    {formatPrice(move.delta)}
                    {move.percent === null ? null : (
                      <span className="muted"> ({move.percent > 0 ? '+' : ''}{move.percent}%)</span>
                    )}
                  </span>
                </div>
                <p className="muted" style={{ fontSize: '0.74rem', margin: '0.5rem 0 0' }}>
                  {formatPrice(move.low)}–{formatPrice(move.high)} across {move.days} recorded
                  {move.days === 1 ? ' day' : ' days'}, lowest listing. From {series[0].day}.
                </p>
              </>
            ) : (
              <p className="muted" style={{ fontSize: '0.78rem', margin: 0 }}>
                {series.length
                  ? `Only ${series.length} day${series.length === 1 ? '' : 's'} on record so far — the archive keeps a price from each ingest and needs a few before a line means anything.`
                  : 'No price on record for this card.'}
              </p>
            )}
          </div>

          {card.keywords.length ? (
            <div className="meta-block">
              <h2>Keywords</h2>
              <div className="chip-row">
                {card.keywords.map((k) => (
                  <Link
                    key={k}
                    href={`/cards?keyword=${encodeURIComponent(k)}`}
                    className="chip chip-link"
                  >
                    {k}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <div className="meta-block">
            <h2>Printings</h2>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Card number</th>
                    <th>Art</th>
                    <th>Rarity</th>
                    <th style={{ textAlign: 'right' }}>Market</th>
                    <th style={{ textAlign: 'right' }}>Low</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {card.printings.map((p) => (
                    <tr key={p.id}>
                      <td className="mono">{p.label}</td>
                      <td>{p.variant}</td>
                      <td className="muted">{p.rarity}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>
                        {formatPrice(p.price?.market)}
                      </td>
                      <td className="mono muted" style={{ textAlign: 'right' }}>
                        {formatPrice(p.price?.low)}
                      </td>
                      <td className="mono muted">{p.price?.updated ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ fontSize: '0.72rem', marginTop: '0.6rem' }}>
              Prices are TCGplayer figures collected by OPTCG API. They are a reference, not an
              offer, and Poneglyph does not sell cards.
            </p>
          </div>
        </div>
      </div>

      {related.length ? (
        <section className="shell related">
          <div className="section-head">
            <h2 className="display">
              More {anchor} in {card.colors[0]}
            </h2>
            <Link
              href={`/cards?trait=${encodeURIComponent(anchor)}&color=${card.colors[0]}`}
              className="muted"
              style={{ fontSize: '0.8rem' }}
            >
              See all →
            </Link>
          </div>
          <div className="card-grid">
            {related.map((c) => (
              <CardTile key={c.id} card={c} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function Stat({
  label,
  value,
  format = String,
}: {
  label: string;
  value: number | null;
  format?: (n: number) => string;
}) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd className={value === null ? 'none' : undefined}>
        {value === null ? '—' : format(value)}
      </dd>
    </div>
  );
}
