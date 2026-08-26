'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Mark from './Mark';

/*
 * Account is here only when there is a Supabase project behind it. The variable is
 * inlined at build time, so a deployment without accounts does not advertise a page
 * whose only content would be "not set up" — and the rest of the site never needed
 * one anyway.
 */
const ACCOUNTS = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const NAV = [
  { href: '/cards', label: 'Cards' },
  { href: '/deckbuilder', label: 'Build' },
  { href: '/decks', label: 'Metagame' },
  { href: '/events', label: 'Events' },
  { href: '/spoilers', label: 'Spoilers' },
  { href: '/banlist', label: 'Banlist' },
  ...(ACCOUNTS ? [{ href: '/account', label: 'Account' }] : []),
];

/*
 * Sets is not here either. Browsing by set is a filter on the card archive, and
 * /cards already has that facet — two entries for one question. The set pages stay,
 * linked from every card and from the footer, since a set has a page worth reading.
 *
 * Nor are /tournaments and /players, for the opposite reason: they are new, and
 * eight entries is already the most a phone will hold on one line. Both are linked
 * from the metagame page and from each other, which is where someone is standing
 * when the question occurs to them, and both are in the footer and the sitemap.
 */

/*
 * Data and Legal are not here. They are reference pages you visit once, and putting
 * them in the top bar cost two slots out of eight in a menu that is read on a phone.
 * Both stay linked from the footer of every page — and the Bandai notice itself is in
 * that footer in full, not only on /legal, so nothing about the disclaimer depends on
 * this list.
 */

export function Masthead() {
  const pathname = usePathname();
  return (
    <header className="masthead">
      <div className="shell masthead-inner">
        <Link href="/" className="mark" aria-label="Poneglyph — home">
          <Mark />
          <span className="mark-word">Poneglyph</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
