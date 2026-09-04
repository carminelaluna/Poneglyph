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
    <div className="shell account-page" style={{ paddingBlock: '2rem 3rem', maxWidth: '52rem' }}>
      {/*
        One title, not two. This page said "Account" in an eyebrow and "Your
        account" underneath it in display type, which is the same word twice at two
        sizes. The eyebrow is the `h1` rather than a paragraph beside a deleted one,
        because a page with no heading at all is a structural hole and not a
        tidier page — it is what a screen reader announces the page as.
      */}
      <h1 className="eyebrow" style={{ margin: 0 }}>
        Account
      </h1>
      <AccountView />
    </div>
  );
}
