import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Legal notice',
  description:
    'Poneglyph is an unofficial fan project and is not affiliated with, endorsed by, or approved by Bandai. Trademark and copyright notice.',
  robots: { index: true, follow: true },
};

export default function LegalPage() {
  return (
    <div className="shell" style={{ paddingBlock: '2rem 3rem', maxWidth: '78ch' }}>
      <p className="eyebrow">Legal</p>
      <h1 className="display" style={{ fontSize: 'clamp(1.6rem, 3.2vw, 2.3rem)', margin: '0.5rem 0 0' }}>
        Not affiliated with Bandai
      </h1>

      <div className="rules" style={{ marginTop: '1.75rem' }}>
        <p className="rules-line">
          <b className="rules-keyword">Notice</b> Poneglyph is an unofficial, fan-made reference
          site. It is <strong>not affiliated with, endorsed, sponsored, or approved by</strong>{' '}
          Bandai Co., Ltd., Bandai Namco Entertainment Inc., Bandai Namco Holdings, Eiichiro Oda,
          Shueisha Inc., Toei Animation Co., Ltd., or any of their subsidiaries, affiliates, or
          licensees.
        </p>
      </div>

      <Section title="Trademarks">
        <p>
          <em>ONE PIECE</em>, ONE PIECE CARD GAME, and all related names, marks, logos, characters,
          and product titles are trademarks and/or registered trademarks of their respective
          owners. Their use on this site is nominative — that is, to identify the cards being
          described — and does not imply any endorsement or association.
        </p>
      </Section>

      <Section title="Card images and text">
        <p>
          All card artwork, card names, rules text, flavour text, set names, and card numbering are
          the copyright of Bandai and its licensors. They appear here solely for identification,
          commentary, and reference for players of the game. Poneglyph claims no ownership of that
          material and derives no exclusive rights from reproducing it.
        </p>
        <p>
          Card images are served through this site&rsquo;s own image proxy so that pages load
          reliably. If a rights holder would prefer that specific material not be displayed here,
          it will be removed on request.
        </p>
      </Section>

      <Section title="Rules and rulings">
        <p>
          Rules text on this site is transcribed from public card list data and may lag behind
          official errata, bans, or restrictions. Poneglyph is <strong>not</strong> a source of
          official rulings. For tournament-legal information, always consult the official ONE PIECE
          CARD GAME website and the current comprehensive rules.
        </p>
        <p>
          <a
            href="https://en.onepiece-cardgame.com/"
            target="_blank"
            rel="noreferrer noopener"
            className="chip chip-link"
            style={{ padding: '0.5rem 0.9rem', marginTop: '0.5rem' }}
          >
            Official ONE PIECE CARD GAME site
          </a>
        </p>
      </Section>

      <Section title="Prices">
        <p>
          Market prices shown alongside cards are third-party figures collected from public sources
          and are provided for reference only. They are not offers, appraisals, or financial
          advice. Poneglyph does not buy, sell, or broker cards.
        </p>
      </Section>

      <Section title="Data attribution">
        <p>
          Card data is assembled from public community datasets, each credited on the{' '}
          <a href="/data">data page</a>. Those projects derive their information from the official
          ONE PIECE CARD GAME card list.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          For corrections, takedown requests, or questions about how this site sources its data,
          use the contact address published in the project repository. Requests from rights holders
          are actioned before anything else.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="meta-block">
      <h2>{title}</h2>
      <div style={{ color: 'var(--glyph-mid)', lineHeight: 1.7, display: 'grid', gap: '0.85rem' }}>
        {children}
      </div>
    </section>
  );
}
