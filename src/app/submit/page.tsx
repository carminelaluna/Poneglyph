import type { Metadata } from 'next';
import Link from 'next/link';
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
      <p className="muted" style={{ maxWidth: '66ch', marginTop: '0.8rem' }}>
        What you send joins the numbers other people read — alongside Limitless and One Piece
        Top Decks, and counted the same way. Everything is reviewed before it appears, and
        nothing here is refused for being incomplete: a 49-card list, or one naming a card the
        archive has not ingested yet, can still be sent. Paste the lists in the format the
        simulator reads, which is what the <Link href="/deckbuilder" className="inline-link">deck builder</Link>{' '}
        exports.
      </p>

      <SubmitForm />
    </div>
  );
}
