import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_EMAIL, CONTACT_MAILTO } from '@/lib/contact';

/**
 * Privacy policy.
 *
 * A separate page because Discord and Google each ask for a privacy URL when you
 * register an OAuth application, and pointing both at a page that also carries the
 * trademark disclaimer and the data attributions is not what they are asking for.
 *
 * Written as what actually happens. Most of this site collects nothing at all, and
 * saying so plainly is more useful — and more honest — than boilerplate that implies
 * a data operation nobody is running.
 */

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What Poneglyph stores, which is nothing at all unless you make an account. No analytics, no advertising, no tracking.',
};

export default function PrivacyPage() {
  return (
    <div className="shell" style={{ paddingBlock: '2rem 3rem', maxWidth: '60rem' }}>
      <p className="eyebrow">Privacy</p>
      <h1
        className="display"
        style={{ fontSize: 'clamp(1.7rem, 3.4vw, 2.5rem)', margin: '0.5rem 0 0' }}
      >
        What is stored
      </h1>
      <p className="muted" style={{ maxWidth: '68ch', marginTop: '0.8rem' }}>
        Poneglyph is an unofficial fan project run by one person. This page describes what it
        does with data, which for most visitors is nothing.
      </p>

      <Section title="Browsing collects nothing">
        <p>
          There is no analytics, no advertising, no tracking pixel and no cookie banner —
          because there is nothing to consent to. Pages are static files, and the card and
          tournament data they read is fetched from this same site.
        </p>
        <p>
          Your browser keeps ordinary things it keeps for any site: cached files, and the
          filter choices some pages put in the address bar so a view can be linked to. None of
          that is sent anywhere.
        </p>
      </Section>

      <Section title="If you make an account">
        <p>
          An account is optional. It exists so you can keep decks of your own and, if you run
          tournaments, submit results. Everything else on the site works without one.
        </p>
        <p>What is stored, and nothing else:</p>
        <ul>
          <li>An account identifier, and the display name and email address your sign-in provider gives us.</li>
          <li>The decks you choose to save, and any tournament results you submit.</li>
          <li>Whether your account has been granted the organizer role.</li>
        </ul>
        <p>
          Signing in through Discord or Google means <strong>no password exists here at all</strong>.
          If you sign in with an email address instead, the password is stored hashed by our
          authentication provider and is never visible to us.
        </p>
      </Section>

      <Section title="Why, and on what basis">
        <p>
          The data above is used only to run the account: to know that a saved deck is yours,
          and that a submitted tournament came from a real organizer. It is not sold, shared,
          rented, or used to build a profile of you, and it is not used for advertising.
        </p>
        <p>
          The legal basis is the performance of the service you asked for by creating an
          account. There is no marketing, so there is nothing to opt out of.
        </p>
      </Section>

      <Section title="Who else touches it">
        <p>
          Accounts and their data are held by <a href="https://supabase.com" target="_blank" rel="noreferrer noopener">Supabase</a>,
          which processes them on our behalf. If you sign in with Discord or Google, that
          provider knows you signed in here — the same as anywhere else you use them.
        </p>
        <p>
          Card images are served from our own content delivery network, so looking at a card
          tells nobody else that you did. The one exception is unreleased-set images on{' '}
          <Link href="/spoilers">Spoilers</Link>, which are shown from One Piece Top
          Decks&rsquo; servers with attribution rather than copied — loading those reaches
          their server.
        </p>
      </Section>

      <Section title="How long, and how to get rid of it">
        <p>
          Account data is kept while the account exists. Ask at the contact address below and
          it will be deleted — the account and everything in it — without needing a reason.
        </p>
        <p>
          You can also ask for a copy of what is stored about you, or for a correction. There
          is not much of it, so these are not difficult requests to answer.
        </p>
        <p>
          Tournament results that have been approved and published are a separate matter:
          those become part of the public record of an event, alongside the same results from
          Limitless and One Piece Top Decks, and deleting an account does not retract them.
          Ask if a specific result should not be there.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          If this changes in a way that matters, the page changes with it and the date below
          moves. For anything on this page — a request, a correction, or a question about what
          is held — write to <a href={CONTACT_MAILTO} className="inline-link">
            {CONTACT_EMAIL}
          </a>.
        </p>
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          See also the <Link href="/terms">terms of use</Link> and the{' '}
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
