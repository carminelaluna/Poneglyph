import type { Metadata } from 'next';
import AccountView from './AccountView';
import './account.css';

export const metadata: Metadata = {
  title: 'Account',
  description:
    'Sign in to Poneglyph with Discord, Google or an email address. Tournament organizers can submit results for review.',
  robots: { index: false, follow: true },
};

export default function AccountPage() {
  return (
    <div className="shell account-page" style={{ paddingBlock: '2rem 3rem', maxWidth: '52rem' }}>
      <h1 className="eyebrow" style={{ margin: 0 }}>
        Account
      </h1>
      <AccountView />
    </div>
  );
}
