import type { Metadata } from 'next';
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
        {/*
          Not "Sign in": this is the page for your account either way, and half the
          people reading it are already signed in. With the intro paragraph gone it
          was the only thing left at the top, and it was telling a signed-in reader
          to do something they had done.
        */}
        Your account
      </h1>
      <AccountView />
    </div>
  );
}
