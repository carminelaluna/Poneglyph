import type { Metadata } from 'next';
import Link from 'next/link';
import ReviewQueue from './ReviewQueue';
import '../submit/submit.css';
import './review.css';

export const metadata: Metadata = {
  title: 'Review submissions',
  description: 'Approve or reject tournaments submitted by organizers.',
  /* Useful to the one or two people holding the role, and to nobody else. */
  robots: { index: false, follow: false },
};

export default function ReviewPage() {
  return (
    <div className="shell" style={{ paddingBlock: '2rem 3rem', maxWidth: '62rem' }}>
      <p className="eyebrow">Review</p>
      <h1
        className="display"
        style={{ fontSize: 'clamp(1.7rem, 3.4vw, 2.5rem)', margin: '0.5rem 0 0' }}
      >
        Submissions waiting
      </h1>
      <p className="muted" style={{ maxWidth: '66ch', marginTop: '0.8rem' }}>
        Approving does not publish anything by itself. The next{' '}
        <Link href="/data">ingest</Link> reads approved rows and folds them into the corpus
        with the rest, so what happens here is a decision rather than a deployment.
      </p>

      <div className="notice">
        <p style={{ margin: 0 }}>
          <strong>What is being decided.</strong> Every share and win rate on this site is
          derived from recorded results. A tournament that never happened, or a field
          uploaded as though it were the whole Swiss when it was the top cut, does not look
          wrong once it is in — it just moves the numbers. That is what the review is for.
        </p>
      </div>

      <ReviewQueue />
    </div>
  );
}
