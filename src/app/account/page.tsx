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
        organizers — to submit results. Everything else here works without one. It stores an
        account id, the name you sign in with and the decks you save, and nothing else:{' '}
        <Link href="/privacy" className="inline-link">privacy</Link> has the detail,{' '}
        <Link href="/terms" className="inline-link">terms</Link>{' '}
        what is expected of you.
      </p>

      <AccountView />
    </div>
  );
}
