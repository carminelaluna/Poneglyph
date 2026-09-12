import type { Metadata } from 'next';
import ReviewQueue from './ReviewQueue';
import '../submit/submit.css';
import './review.css';

export const metadata: Metadata = {
  title: 'Review submissions',
  description: 'Approve or reject tournaments submitted by organizers.',
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
      <ReviewQueue />
    </div>
  );
}
