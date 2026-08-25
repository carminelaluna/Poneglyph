'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Mark from './Mark';

const NAV = [
  { href: '/cards', label: 'Cards' },
  { href: '/decks', label: 'Metagame' },
  { href: '/sets', label: 'Sets' },
  { href: '/spoilers', label: 'Spoilers' },
  { href: '/banlist', label: 'Banlist' },
  { href: '/data', label: 'Data' },
  { href: '/legal', label: 'Legal' },
];

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
