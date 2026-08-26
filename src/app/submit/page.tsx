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
        Top Decks, and counted the same way. Everything is reviewed before it appears.
      </p>

      <div className="notice">
        <p style={{ margin: 0 }}>
          <strong>Paste the decklists, do not rebuild them.</strong> The format is the one
          OPTCGSim reads — <code>4xOP01-025</code>, one card per line, Leader included — which
          is also what this site&rsquo;s <Link href="/deckbuilder">deck builder</Link> exports.
          A list that came out of here goes straight back in.
        </p>
        <p style={{ margin: '0.6rem 0 0' }}>
          Everything here is checked and nothing is refused. A deck that is 49 cards, or names
          a card the archive has not ingested yet, can still be sent — our data being behind is
          not a reason to lose a real result.
        </p>
      </div>

      <SubmitForm />
    </div>
  );
}
