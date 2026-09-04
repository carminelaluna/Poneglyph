import type { Metadata } from 'next';
import Link from 'next/link';
import { meta } from '@/lib/cards';
import { decksMeta, hasDeckData } from '@/lib/decks';
import banlistJson from '@data/banlist.json';
import matchupsJson from '@data/matchups.json';
import priceHistory from '@data/price-history.json';

export const metadata: Metadata = {
  title: 'Data sources',
  description:
    'Where Poneglyph gets its card data, how fresh it is, and how the archive is rebuilt.',
};

const matchups = matchupsJson as { counts: { matches: number; tournaments: number; pending: number } };
const priceDays = (priceHistory as { days?: string[] }).days ?? [];

/* Only the two fields this page reads; the banlist page owns the full shape. */
const banlist = banlistJson as {
  effectiveFrom: string | null;
  source: { label: string; url: string };
};

export default function DataPage() {
  const built = new Date(meta.generatedAt);
  const upstream = meta.upstreamBuiltAt ? new Date(meta.upstreamBuiltAt) : null;
  const fmt = (d: Date) =>
    d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';

  return (
    <div className="shell" style={{ paddingBlock: '2rem 3rem', maxWidth: '90ch' }}>
      <p className="eyebrow">Data</p>
      <h1 className="display" style={{ fontSize: 'clamp(1.6rem, 3.2vw, 2.3rem)', margin: '0.5rem 0 0' }}>
        Where the archive comes from
      </h1>
      <p className="muted" style={{ marginTop: '0.9rem', maxWidth: '64ch' }}>
        Card data is merged from three public sources on every rebuild. Each one has a defined
        job, and a source going down degrades the archive rather than breaking it.
      </p>

      <dl className="stats" style={{ marginTop: '1.75rem' }}>
        <div className="stat">
          <dt>Cards</dt>
          <dd>{meta.counts.cards.toLocaleString('en-US')}</dd>
        </div>
        <div className="stat">
          <dt>Printings</dt>
          <dd>{meta.counts.printings.toLocaleString('en-US')}</dd>
        </div>
        <div className="stat">
          <dt>Sets</dt>
          <dd>{meta.counts.sets}</dd>
        </div>
        <div className="stat">
          <dt>Rules text</dt>
          <dd>{meta.coverage.effect}%</dd>
        </div>
        <div className="stat">
          <dt>Priced</dt>
          <dd>{meta.coverage.price}%</dd>
        </div>
        <div className="stat">
          <dt>Build time</dt>
          <dd>{(meta.durationMs / 1000).toFixed(0)}s</dd>
        </div>
      </dl>

      <div className="meta-block" style={{ marginTop: '2rem' }}>
        <h2>Freshness</h2>
        <table className="table">
          <tbody>
            <tr>
              <td className="muted">Archive rebuilt</td>
              <td className="mono">{fmt(built)}</td>
            </tr>
            {upstream ? (
              <tr>
                <td className="muted">Upstream card list scraped</td>
                <td className="mono">{fmt(upstream)}</td>
              </tr>
            ) : null}
            <tr>
              <td className="muted">Language</td>
              <td className="mono">{meta.language}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="meta-block">
        <h2>Sources</h2>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Role</th>
                <th>Home</th>
              </tr>
            </thead>
            <tbody>
              {meta.sources.map((s) => (
                <tr key={s.id}>
                  <td>{s.label}</td>
                  <td className="muted">{s.role}</td>
                  <td>
                    <a
                      href={s.home}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mono"
                      style={{ fontSize: '0.76rem' }}
                    >
                      {s.home.replace(/^https?:\/\//, '')}
                    </a>
                  </td>
                </tr>
              ))}
              {/*
                The banlist's own source, which comes from a different ingest and so
                is not in `meta.sources`. It belongs in this table all the same: the
                page that used to name it stopped doing so.
              */}
              <tr>
                <td>{banlist.source.label}</td>
                <td className="muted">banned &amp; restricted</td>
                <td>
                  <a
                    href={banlist.source.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mono"
                    style={{ fontSize: '0.76rem' }}
                  >
                    {banlist.source.url.replace(/^https?:\/\//, '')}
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {hasDeckData ? (
        <div className="meta-block">
          <h2>Decklists</h2>
          <p className="muted" style={{ maxWidth: '64ch', marginTop: 0 }}>
            Tournament results come from{' '}
            <a href={decksMeta.source.home} target="_blank" rel="noreferrer noopener">
              {decksMeta.source.label}
            </a>{' '}
            through its{' '}
            <a href={decksMeta.source.docs} target="_blank" rel="noreferrer noopener">
              public API
            </a>
            . That API allows 50 requests every 5 minutes, so the deck ingest is resumable: each
            run spends a fixed request budget and continues where the last one stopped.
          </p>
          <table className="table">
            <tbody>
              <tr>
                <td className="muted">Decklists</td>
                <td className="mono">{decksMeta.counts.decks.toLocaleString('en-US')}</td>
              </tr>
              <tr>
                <td className="muted">Tournaments read</td>
                <td className="mono">{decksMeta.coverage.tournamentsRead.toLocaleString('en-US')}</td>
              </tr>
              <tr>
                <td className="muted">Archetypes</td>
                <td className="mono">{decksMeta.counts.archetypes}</td>
              </tr>
              <tr>
                <td className="muted">Window</td>
                <td className="mono">
                  {decksMeta.coverage.oldest?.slice(0, 10) ?? '—'} →{' '}
                  {decksMeta.coverage.newest?.slice(0, 10) ?? '—'}
                </td>
              </tr>
              <tr>
                <td className="muted">Last deck refresh</td>
                <td className="mono">{fmt(new Date(decksMeta.generatedAt))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      {/*
        Two things the archive keeps that no upstream publishes: a record of who
        beat whom, and yesterday's prices. Both are built here over time rather
        than fetched, so how far back they go is a fact about this site and belongs
        on the page that says where everything comes from.
      */}
      <div className="meta-block">
        <h2>Kept over time</h2>
        <p className="muted" style={{ maxWidth: '64ch', marginTop: 0 }}>
          Neither of these can be fetched. Prices arrive as one number with a scrape
          date, so a history exists only because each ingest writes a point; pairings
          are published per tournament, so a matchup record exists only once every
          bracket has been read. Both started when the archive started keeping them,
          and nothing is back-filled.
        </p>
        <table className="table">
          <tbody>
            <tr>
              <td className="muted">Matches recorded</td>
              <td className="mono">{matchups.counts.matches.toLocaleString('en-US')}</td>
            </tr>
            <tr>
              <td className="muted">Brackets read</td>
              <td className="mono">
                {matchups.counts.tournaments.toLocaleString('en-US')}
                {matchups.counts.pending
                  ? ` · ${matchups.counts.pending.toLocaleString('en-US')} to go`
                  : ''}
              </td>
            </tr>
            <tr>
              <td className="muted">Price history</td>
              <td className="mono">
                {priceDays.length} day{priceDays.length === 1 ? '' : 's'} ·{' '}
                {priceDays[0] ?? '—'} → {priceDays.at(-1) ?? '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/*
        The caveats that used to sit in a boxed callout on the top of /decks,
        /tournaments and /players — one on each, so a reader met the same treatment
        on nearly every page and learned to skip it.

        They are here because they are all the same kind of thing: not a warning
        about the page you are on, but an explanation of how the archive was built,
        which is what this page is for. Each of those pages keeps one line pointing
        at this one.
      */}
      <div className="meta-block">
        <h2>How to read the numbers</h2>
        <div style={{ color: 'var(--glyph-mid)', lineHeight: 1.7, display: 'grid', gap: '0.85rem', maxWidth: '68ch' }}>
          <p style={{ margin: 0 }}>
            <strong>Share and win rate are counted from different decks.</strong> Limitless
            publishes whole Swiss fields; One Piece Top Decks publishes only the decks that
            placed. Share counts every recorded deck, because &ldquo;how much of the field was
            this&rdquo; is answerable from any of them. A win rate counts only decks that came
            from a whole field, and every one is shown with the sample it came from — a win
            rate over decks that placed would read near 100% and describe the sample rather
            than the deck.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Decks recorded and entrants are different numbers.</strong> A 128-player
            Regional can appear here with four decklists on record, because that is what the
            source published. Where no source reported a field size, the page says so instead
            of printing a zero — a blank reads as a bug and a zero reads as an empty room.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Player names are never merged across spellings.</strong>{' '}
            <code>Ric Masterflash</code> and <code>ricmasterflash</code> stay two entries
            unless the sources wrote them identically. Guessing that two handles are one
            person is the kind of tidying that silently invents a career. Placeholders are
            dropped rather than listed: <code>NA</code> alone appears 172 times in the raw
            data and would otherwise top every leaderboard.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Matchups come from brackets, not from records.</strong> A win rate is a
            deck&rsquo;s record against the field; a matchup is its record against a named
            opponent, joined from published pairings and the Leader each player registered at
            that event. Only Limitless publishes pairings, so matchups cover its events and
            say so. Mirrors are left out, and a pair that has met fewer than five times is
            held back — 67% from three games is noise wearing a percentage.
          </p>
          {/*
            The banlist page used to carry these two sentences itself, above the
            cards. They are facts about the rules rather than about the page, and
            this is where the rest of "how to read what you are looking at" lives,
            so they moved rather than went.
          */}
          <p style={{ margin: 0 }}>
            <strong>A ban applies to a card, not to a printing.</strong> Alternate arts count
            as the same card, so a banned card is banned in every version of it. Restrictions
            apply to both Standard and Extra unless the list says otherwise
            {banlist.effectiveFrom ? (
              <>
                {' — the current one has been in effect since '}
                <strong style={{ color: 'var(--glyph)' }}>{banlist.effectiveFrom}</strong>
              </>
            ) : null}
            {'. It is read from '}
            <a
              href={banlist.source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-link"
            >
              {banlist.source.label}
            </a>
            ; where this site and Bandai disagree, Bandai is right.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Time windows are measured from the newest result on record</strong>, not
            from today. Results arrive in batches, so anchoring on the clock would quietly
            empty &ldquo;last 7 days&rdquo; whenever ingestion paused.
          </p>
        </div>
      </div>

      <div className="meta-block">
        <h2>How a rebuild works</h2>
        <ol className="muted" style={{ paddingLeft: '1.2rem', lineHeight: 1.75, maxWidth: '64ch' }}>
          <li>
            The card spine — every printing, with colours, cost, power, counter, attributes and
            traits — is read from the versioned Punk Records dataset.
          </li>
          <li>Rules text is filled in from Vegapull Records in bulk, then topped up per card.</li>
          <li>TCGplayer market prices and printable set names come from OPTCG API.</li>
          <li>
            The merge aborts before writing anything if the result looks broken, so the site keeps
            serving the last good archive.
          </li>
          <li>
            Card art is proxied and mirrored through this site, because the official CDN refuses
            cross-origin requests.
          </li>
        </ol>
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          How each source is used and why, the update schedule, and the rules the numbers on this
          site follow are documented in the project&rsquo;s{' '}
          <code className="mono">README.md</code> and <code className="mono">CLAUDE.md</code>.
        </p>
      </div>

      <p style={{ marginTop: '2rem' }}>
        <Link href="/legal" className="chip" style={{ padding: '0.5rem 0.9rem' }}>
          Read the legal notice
        </Link>
      </p>
    </div>
  );
}
