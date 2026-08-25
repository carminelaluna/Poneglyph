'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import DeckView from './deck/[id]/DeckView';
import EventView from './event/[id]/EventView';
import PlayerView from './player/[slug]/PlayerView';
import { BASE_PATH } from '@/lib/paths';
import './decks.css';

/**
 * Not found — and, for three routes, the way most pages are reached.
 *
 * There are 7,150 events, 8,679 players and 20,941 decklists. Prerendering all of
 * them costs 5.5 GB against GitHub Pages' 1 GB, so only the ones worth a title of
 * their own get a file; the rest land here, because a static host answers anything
 * it has no file for with 404.html.
 *
 * That is a real HTTP 404 under a page that renders correctly. The trade is
 * deliberate: those pages carry no search value — a shop tournament with three
 * recorded lists is not a search result anyone wants — while the Regionals, the
 * regulars and the notable finishes are prerendered and answer 200 with a proper
 * title. What matters is that every link on the site resolves to its content, and
 * this is what makes that true without the 5.5 GB.
 *
 * Rendering happens after mount because the path is only known in the browser: this
 * same file is what every unmatched URL receives.
 */
export default function NotFound() {
  const [route, setRoute] = useState<{ kind: string; key: string } | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let path = globalThis.location.pathname;
    if (BASE_PATH && path.startsWith(BASE_PATH)) path = path.slice(BASE_PATH.length);
    /* trailingSlash is on, so /event/abc/ and /event/abc are the same address. */
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 2 && ['event', 'player', 'deck'].includes(parts[0])) {
      setRoute({ kind: parts[0], key: decodeURIComponent(parts[1]) });
    }
    setChecked(true);
  }, []);

  if (route?.kind === 'event') return <EventView id={route.key} />;
  if (route?.kind === 'player') return <PlayerView slug={route.key} />;
  if (route?.kind === 'deck') return <DeckView id={route.key} />;

  /* Nothing is drawn until the path has been read, so the 404 never flashes first. */
  if (!checked) return <div className="shell" style={{ paddingBlock: '5rem 6rem' }} />;

  return (
    <div className="shell" style={{ paddingBlock: '5rem 6rem', maxWidth: '60ch' }}>
      <p className="eyebrow">404</p>
      <h1 className="display" style={{ fontSize: 'clamp(1.7rem, 4vw, 2.6rem)', margin: '0.5rem 0 0' }}>
        Nothing carved here
      </h1>
      <p className="muted" style={{ marginTop: '1rem' }}>
        That card number or set code is not in the archive. Search by name or card number
        instead — partial matches work.
      </p>
      <p style={{ marginTop: '1.75rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <Link href="/cards" className="chip chip-link" style={{ padding: '0.55rem 1rem' }}>
          Search the archive
        </Link>
        <Link href="/sets" className="chip chip-link" style={{ padding: '0.55rem 1rem' }}>
          Browse sets
        </Link>
      </p>
    </div>
  );
}
