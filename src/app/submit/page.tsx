import type { Metadata } from 'next';
import SubmitForm from './SubmitForm';
import './submit.css';

export const metadata: Metadata = {
  title: 'Submit results',
  description:
    'Tournament organizers: submit an event and its decklists for review. Approved results join the metagame figures alongside Limitless and One Piece Top Decks.',
  /* Useful to exactly the handful of people who have the role. */
  robots: { index: false, follow: true },
};

export default function SubmitPage() {
  return (
    <div className="shell" style={{ paddingBlock: '2rem 3rem', maxWidth: '62rem' }}>
      <p className="eyebrow">Organizers</p>
      <h1
        className="display"
        style={{ fontSize: 'clamp(1.7rem, 3.4vw, 2.5rem)', margin: '0.5rem 0 0' }}
      >
        Submit an event
      </h1>
      <SubmitForm />
    </div>
  );
}
