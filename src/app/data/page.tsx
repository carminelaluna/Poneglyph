import type { Metadata } from 'next';
import Link from 'next/link';
import { meta } from '@/lib/cards';
import { decksMeta, hasDeckData } from '@/lib/decks';

export const metadata: Metadata = {
  title: 'Data sources',
  description:
    'Where Poneglyph gets its card data, how fresh it is, and how the archive is rebuilt.',
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
        <Link href="/legal" className="chip chip-link" style={{ padding: '0.5rem 0.9rem' }}>
          Read the legal notice
        </Link>
      </p>
    </div>
  );
}
