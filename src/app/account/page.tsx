import type { Metadata } from 'next';
import Link from 'next/link';
import AccountView from './AccountView';
import './account.css';

export const metadata: Metadata = {
  title: 'Account',
  description:
    'Sign in to Poneglyph with Discord, Google or an email address. Tournament organizers can submit results for review.',
  /* Nothing here is worth a search result, and the page differs per reader. */
  robots: { index: false, follow: true },
};

export default function AccountPage() {
  return (
    <div className="shell" style={{ paddingBlock: '2rem 3rem', maxWidth: '52rem' }}>
      <p className="eyebrow">Account</p>
      <h1
        className="display"
        style={{ fontSize: 'clamp(1.7rem, 3.4vw, 2.5rem)', margin: '0.5rem 0 0' }}
      >
        Sign in
      </h1>
      <p className="muted" style={{ maxWidth: '62ch', marginTop: '0.8rem' }}>
        An account is only needed to keep decks of your own, and — for tournament
        organizers — to submit results. Everything else here works without one.
      </p>

      {/*
        Said before the button, not after. Anyone about to hand over an identity is
        entitled to know what happens to it first.
      */}
      <div className="notice">
        <p style={{ margin: 0 }}>
          <strong>What is stored:</strong> an account id, the name you sign in with, and the
          decks you choose to save. Nothing is shared with anyone, there is no analytics on
          this site and no advertising. Signing in through Discord or Google means no password
          exists here to lose. Full terms at <Link href="/legal">legal</Link>.
        </p>
      </div>

      <AccountView />
    </div>
  );
}
