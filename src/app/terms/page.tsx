import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_EMAIL, CONTACT_MAILTO } from '@/lib/contact';

/**
 * Terms of use.
 *
 * The other URL Discord and Google ask for when registering an OAuth application.
 *
 * Deliberately short and in plain words. This is a free fan archive with no payment,
 * no subscription and no company behind it, and terms written to sound like a
 * software licence would misrepresent what it is.
 */

export const metadata: Metadata = {
  title: 'Terms',
  description:
    'Terms of use for Poneglyph: what the site is, what an account is for, and what is expected of tournament organizers who submit results.',
};

export default function TermsPage() {
  return (
    <div className="shell" style={{ paddingBlock: '2rem 3rem', maxWidth: '60rem' }}>
      <p className="eyebrow">Terms</p>
      <h1
        className="display"
        style={{ fontSize: 'clamp(1.7rem, 3.4vw, 2.5rem)', margin: '0.5rem 0 0' }}
      >
        Terms of use
      </h1>
      <p className="muted" style={{ maxWidth: '68ch', marginTop: '0.8rem' }}>
        Poneglyph is a free, unofficial fan archive of the ONE PIECE CARD GAME, run by one
        person. Using it means accepting what is below.
      </p>

      <Section title="What this is">
        <p>
          A searchable archive of published card data and tournament results, gathered from
          public sources and listed on the <Link href="/data">data page</Link>. It is not
          affiliated with, endorsed by, or approved by Bandai — the full notice is on the{' '}
          <Link href="/legal">disclaimer page</Link>.
        </p>
        <p>
          It is offered as it is, free of charge. There is no guarantee that it will be
          available, that it will keep existing, or that any number on it is correct.
        </p>
      </Section>

      <Section title="The data may be wrong">
        <p>
          Card text, prices, tournament results and metagame figures are derived from third
          parties and from automated ingestion. Mistakes upstream become mistakes here.
        </p>
        <p>
          <strong>Nothing here is an official ruling.</strong> For how a card actually works in
          a tournament, read Bandai&rsquo;s own rules pages and ask the judge. Do not use this
          site as the authority in a dispute, and do not treat prices as an offer.
        </p>
      </Section>

      <Section title="Accounts">
        <p>
          An account is optional and free. You are responsible for what happens under it —
          keep your sign-in provider secure. Do not create accounts to impersonate someone, and
          do not try to obtain the organizer role by pretending to be an organizer.
        </p>
        <p>
          An account can be removed, and the organizer role withdrawn, if it is used to submit
          false data or to abuse the site. That decision is made by a person, not a rule, and
          you can ask why.
        </p>
      </Section>

      <Section title="Submitting tournament results">
        <p>
          If you have the organizer role, what you submit joins the metagame figures other
          people read. That is a responsibility rather than a feature:
        </p>
        <ul>
          <li>Submit results from events you actually ran, as they actually happened.</li>
          <li>
            Say honestly whether you are uploading a whole field or only the decks that placed.
            It is not a formality — share is counted over every deck, win rate only over whole
            fields, and mislabelling one as the other makes a number that means nothing.
          </li>
          <li>Do not submit players&rsquo; personal details. A name as reported is enough.</li>
        </ul>
        <p>
          Submissions are reviewed before publication and can be rejected. Once approved and
          published, a result is part of the public record of that event; ask if a specific one
          should be removed.
        </p>
      </Section>

      <Section title="Using what is here">
        <p>
          Read it, link to it, quote it, share a deck from it. What you may not do is hammer
          the site with automated requests, republish the card images as your own, or present
          this data as official.
        </p>
        <p>
          Card names, images and rules text belong to Bandai and its licensors and are
          reproduced here for reference — they are not ours to license to you. See the{' '}
          <Link href="/legal">disclaimer</Link>.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          These terms can change; the page changes with them. If a change matters and you
          disagree with it, stop using the site and ask for your account to be deleted.
        </p>
        <p>
          For anything here — including a takedown request, which is actioned before anything
          else — write to <a href={CONTACT_MAILTO} className="inline-link">
            {CONTACT_EMAIL}
          </a>.
        </p>
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          See also the <Link href="/privacy">privacy policy</Link> and the{' '}
          <Link href="/legal">trademark and copyright notice</Link>.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="meta-block">
      <h2>{title}</h2>
      <div className="rules" style={{ display: 'grid', gap: '0.8rem' }}>
        {children}
      </div>
    </section>
  );
}
