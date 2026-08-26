import Link from 'next/link';
import { meta } from '@/lib/cards';

/**
 * The Bandai notice. It is a permanent fixture of every page rather than a
 * dismissible banner, and it is repeated in full on /legal.
 */
export function Disclaimer() {
  return (
    <p className="disclaimer">
      <strong>Poneglyph is an unofficial fan project.</strong> It is not affiliated with,
      endorsed, sponsored, or approved by Bandai Co., Ltd., Bandai Namco Entertainment,
      Eiichiro Oda, Shueisha, or Toei Animation. <em>ONE PIECE</em> and the ONE PIECE CARD
      GAME are trademarks of their respective owners. All card images, card names, rules
      text, and set names are the copyright and trademark of Bandai and its licensors, and
      are reproduced here for identification and reference only. Poneglyph claims no
      ownership of that material and makes no claim to represent official rulings — for
      official rules and errata, consult the ONE PIECE CARD GAME website.
    </p>
  );
}

export default function Footer() {
  const updated = new Date(meta.generatedAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <footer className="footer">
      <div className="shell">
        <div className="footer-grid">
          <div>
            <h3>Poneglyph</h3>
            <p style={{ margin: 0, maxWidth: '34ch' }}>
              A searchable archive of every ONE PIECE CARD GAME card — stat line, rules
              text, traits, and every printing.
            </p>
            <p className="mono" style={{ marginTop: '1rem', fontSize: '0.72rem' }}>
              {meta.counts.cards.toLocaleString('en-US')} cards ·{' '}
              {meta.counts.printings.toLocaleString('en-US')} printings · updated {updated}
            </p>
          </div>
          <div>
            <h3>Browse</h3>
            <ul>
              <li><Link href="/cards">All cards</Link></li>
              <li><Link href="/decks">Metagame</Link></li>
              <li><Link href="/sets">Sets</Link></li>
              <li><Link href="/cards?category=Leader">Leaders</Link></li>
              <li><Link href="/cards?sort=price-desc">Most valuable</Link></li>
            </ul>
          </div>
          <div>
            <h3>Data</h3>
            <ul>
              <li><Link href="/data">Sources &amp; freshness</Link></li>
              {meta.sources.map((s) => (
                <li key={s.id}>
                  <a href={s.home} target="_blank" rel="noreferrer noopener">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Legal</h3>
            <ul>
              {/*
                Three separate pages, and not in the top nav on purpose. Discord and
                Google each ask for a privacy URL and a terms URL when you register an
                OAuth application, and they want two addresses, not one page that also
                carries the trademark notice.
              */}
              <li><Link href="/legal">Disclaimer</Link></li>
              <li><Link href="/privacy">Privacy</Link></li>
              <li><Link href="/terms">Terms of use</Link></li>
              <li>
                <a
                  href="https://en.onepiece-cardgame.com/"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Official card game site
                </a>
              </li>
            </ul>
          </div>
        </div>
        <Disclaimer />
      </div>
    </footer>
  );
}
