'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import DeckExport from '@/components/DeckExport';
import Pips from '@/components/Pips';
import { art } from '@/lib/art';
import { formatRecord, isNamedPlayer, ordinal, playerSlug } from '@/lib/meta';
import {
  getDeckCards,
  getDeckRow,
  listPrice,
  loadLeaders,
  type Leaders,
  type ShardRow,
} from '@/lib/shards';

/**
 * One decklist, drawn in the browser.
 *
 * There are 20,941 of them and only notable finishes are prerendered, so this
 * fetches the row from its bucket and the card list from the archetype file the
 * metagame page already uses — see lib/shards.ts.
 */

type Entry = { id: string; count: number; name: string; category: string; price: number | null };

/** Character, Event, Stage — the order groupDeck uses at build time. */
const ORDER = ['Character', 'Event', 'Stage'];

function group(cards: Entry[]) {
  return ORDER.map((category) => {
    const inGroup = cards.filter((c) => c.category === category);
    return {
      category,
      cards: inGroup,
      count: inGroup.reduce((n, c) => n + c.count, 0),
    };
  }).filter((g) => g.cards.length > 0);
}

export default function DeckView({ id }: { id: string }) {
  const [deck, setDeck] = useState<ShardRow | null>(null);
  const [cards, setCards] = useState<Entry[]>([]);
  const [leaders, setLeaders] = useState<Leaders>({});
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    (async () => {
      const [row, table] = await Promise.all([getDeckRow(id), loadLeaders()]);
      if (cancelled) return;
      setLeaders(table);
      if (!row) return setState('missing');
      const list = await getDeckCards(row);
      if (cancelled) return;
      setDeck(row);
      setCards(list ?? []);
      setState('ready');
    })().catch(() => {
      if (!cancelled) setState('error');
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state === 'loading') {
    return (
      <div className="shell" style={{ paddingBlock: '2rem 3rem' }}>
        <p className="eyebrow">
          <Link href="/decks">Metagame</Link> · Decklist
        </p>
        <p className="muted" style={{ marginTop: '1.5rem' }}>
          Loading this decklist…
        </p>
      </div>
    );
  }

  if (state !== 'ready' || !deck) {
    return (
      <div className="shell" style={{ paddingBlock: '2rem 3rem' }}>
        <p className="eyebrow">
          <Link href="/decks">Metagame</Link> · Decklist
        </p>
        <h1 className="display" style={{ fontSize: '1.6rem', margin: '0.6rem 0 0' }}>
          {state === 'missing' ? 'No such decklist' : 'Could not load this decklist'}
        </h1>
        <p className="muted" style={{ marginTop: '0.8rem', maxWidth: '60ch' }}>
          {state === 'missing'
            ? 'Nothing on record has this id. English results are deduplicated against Limitless, so a list recorded twice is kept once — the surviving copy may have a different id.'
            : 'The decklist file did not load. Check your connection and reload.'}
        </p>
        <p style={{ marginTop: '1.2rem' }}>
          <Link href="/decks">Back to the metagame →</Link>
        </p>
      </div>
    );
  }

  const leader = leaders[deck.l];
  const leaderName = leader?.n ?? deck.l;
  const colors = leader?.c ?? [];
  const archetypeSlug = deck.l.toLowerCase();
  const groups = group(cards);
  const total = cards.reduce((n, c) => n + c.count, 0);
  /* The Leader is part of what a deck costs, so it is part of the total. */
  const price = listPrice(cards, leader);

  /*
   * Cards the archive has no name for. They are almost always from a set that has
   * been played before it was ingested; saying so beats rendering a blank tile.
   */
  const unnamed = cards.filter((c) => !c.category);

  return (
    <div className="shell" style={{ paddingBottom: '3rem' }}>
      <div className="arch-head">
        <img src={art(deck.l, 600)} alt={`${leaderName} (${deck.l})`} />

        <div>
          <p className="eyebrow">
            <Link href="/decks">Metagame</Link> ·{' '}
            <Link href={`/decks/${archetypeSlug}`}>{leaderName}</Link>
          </p>
          <h1
            className="display"
            style={{ fontSize: 'clamp(1.5rem, 3.2vw, 2.3rem)', margin: '0.4rem 0 0' }}
          >
            {deck.a}
          </h1>
          <div className="card-line" style={{ marginTop: '0.7rem' }}>
            <Pips colors={colors} />
            <span>{colors.join(' / ')}</span>
            <span className="dot">·</span>
            <Link href={`/cards/${archetypeSlug}`} className="mono">
              {deck.l}
            </Link>
          </div>

          <dl className="stats" style={{ marginTop: '1.35rem' }}>
            <div className="stat">
              <dt>Placing</dt>
              <dd className={deck.p === null ? 'none' : undefined}>
                {deck.p === null ? '—' : ordinal(deck.p)}
              </dd>
            </div>
            {/*
              Not every source publishes a record or a field size. A zero would read
              as "nobody turned up"; saying it was not recorded is the true statement.
            */}
            <div className="stat">
              <dt>Record</dt>
              <dd className={deck.w + deck.s === 0 ? 'small none' : undefined}>
                {deck.w + deck.s === 0 ? 'Not recorded' : formatRecord(deck.w, deck.s, deck.t)}
              </dd>
            </div>
            <div className="stat">
              <dt>Field</dt>
              <dd className={deck.n ? undefined : 'small none'}>
                {deck.n ? `${deck.n} players` : 'Not recorded'}
              </dd>
            </div>
            <div className="stat">
              <dt>Cards</dt>
              <dd>{total + 1}</dd>
            </div>
            {/*
              Lowest listed, summed over every copy, and honest about the gaps: a
              price is missing for about one card in twenty, and a total that folded
              those in as zero would read as a cheaper deck rather than as an
              incomplete figure.
            */}
            <div className="stat">
              <dt>Lowest listed</dt>
              <dd className={price.total > 0 ? undefined : 'small none'}>
                {price.total > 0 ? `$${price.total.toFixed(2)}` : 'Not priced'}
                {price.total > 0 && price.unpriced ? (
                  <span className="muted small"> · {price.unpriced} unpriced</span>
                ) : null}
              </dd>
            </div>
            <div className="stat">
              <dt>Date</dt>
              <dd className="small">{deck.d}</dd>
            </div>
          </dl>

          <p style={{ marginTop: '1rem', fontSize: '0.86rem' }}>
            {deck.x ? (
              <Link href={`/event/${deck.x}`} className="event-link">
                {deck.e}
              </Link>
            ) : (
              <span className="muted">{deck.e}</span>
            )}
          </p>
          <p className="muted" style={{ marginTop: '0.35rem', fontSize: '0.76rem' }}>
            {deck.g === 'jp' ? 'Japanese' : 'English'} results ·{' '}
            {deck.u ? (
              <a href={deck.u} target="_blank" rel="noreferrer noopener">
                One Piece Top Decks
              </a>
            ) : (
              'Limitless'
            )}
          </p>
        </div>
      </div>

      {/*
        One view of the list, not three. The card images already say what is in the
        deck and how many, and the export below covers copying it out — a text list
        between them was the same information a third time.
      */}
      <div className="section-head" style={{ marginTop: '1.5rem' }}>
        <h2 className="display">Decklist</h2>
        <span className="muted" style={{ fontSize: '0.82rem' }}>
          {deck.p === 1 ? (
            <b style={{ color: 'var(--rune-lit)' }}>Won by </b>
          ) : deck.p !== null ? (
            <>{ordinal(deck.p)} place — </>
          ) : (
            <>Played by </>
          )}
          {isNamedPlayer(deck.a) ? (
            <Link href={`/player/${playerSlug(deck.a)}`} className="player-link">
              <b style={{ color: 'var(--glyph)' }}>{deck.a}</b>
            </Link>
          ) : (
            <b className="muted">{deck.a}</b>
          )}
          {deck.w + deck.s > 0 ? <> · {formatRecord(deck.w, deck.s, deck.t)}</> : null}
        </span>
      </div>

      <p className="deck-breakdown mono">
        {groups.map((g) => (
          <span key={g.category}>
            {g.category} <b>{g.count}</b>
          </span>
        ))}
      </p>

      {unnamed.length > 0 ? (
        <p className="muted" style={{ fontSize: '0.78rem', margin: '0 0 1rem' }}>
          {unnamed.length} card{unnamed.length > 1 ? 's' : ''} in this list
          {unnamed.length > 1 ? ' are' : ' is'} not in the card archive yet:{' '}
          {unnamed.map((u) => `${u.count}× ${u.id}`).join(', ')}.
        </p>
      ) : null}

      <div className="skeleton">
        {groups
          .flatMap((g) => g.cards)
          .map((entry) => (
            <Link key={entry.id} href={`/cards/${entry.id.toLowerCase()}`} className="skel-card">
              <img src={art(entry.id, 320)} alt={entry.name} loading="lazy" />
              <span className="skel-copies">{entry.count}×</span>
              <div className="skel-label" style={{ marginTop: '0.35rem' }}>
                <b>{entry.name}</b>
                <span>{entry.id.split('-')[0]}</span>
              </div>
            </Link>
          ))}
      </div>

      <DeckExport leaderId={deck.l} cards={cards.map((c) => ({ id: c.id, count: c.count }))} />
    </div>
  );
}
