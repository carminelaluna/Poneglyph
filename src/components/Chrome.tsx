'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Mark from './Mark';

const NAV = [
  { href: '/cards', label: 'Cards' },
  { href: '/decks', label: 'Metagame' },
  { href: '/sets', label: 'Sets' },
  { href: '/events', label: 'Events' },
  { href: '/spoilers', label: 'Spoilers' },
  { href: '/banlist', label: 'Banlist' },
];

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
