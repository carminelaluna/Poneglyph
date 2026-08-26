import type { Metadata } from 'next';
import Link from 'next/link';
import regionsJson from '@data/regions.json';
import TournamentBrowser from './TournamentBrowser';
import '../decks.css';
import './directory.css';

const regions = (regionsJson as { regions?: { decks: number }[] }).regions ?? [];
const decks = regions.reduce((n, r) => n + (r.decks ?? 0), 0);

export const metadata: Metadata = {
  title: 'Tournaments',
  description:
    'Every tournament in the archive: date, kind, play setting, how many decklists are on record and which archetype won it.',
};

export default function TournamentsPage() {
  return (
    <div className="shell" style={{ paddingBlock: '2rem 3rem' }}>
      <p className="eyebrow">Results</p>
      <h1
        className="display"
        style={{ fontSize: 'clamp(1.7rem, 3.4vw, 2.5rem)', margin: '0.5rem 0 0' }}
      >
        Every recorded tournament
      </h1>
      <p className="muted" style={{ maxWidth: '68ch', marginTop: '0.8rem' }}>
        {decks.toLocaleString('en-US')} decklists came from these events. Looking for what is
        coming rather than what has happened? The{' '}
        <Link href="/events">official calendar</Link> lists the Regionals, Cups and Finals
        Bandai has announced.
      </p>

      <div className="notice">
        <p style={{ margin: 0 }}>
          <strong>Decks and entrants are different numbers.</strong> Limitless publishes whole
          Swiss fields; One Piece Top Decks publishes only the decks that placed. So a
          128-player Regional can appear here with four decklists on record, and the entrant
          count is whatever the source reported — where none did, it says so rather than
          printing a zero.
        </p>
      </div>

      <TournamentBrowser />
    </div>
  );
}
