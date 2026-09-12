'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { art } from '@/lib/art';
import type { Mover } from '@/lib/prices';

type Named = Mover & { name: string; colors: string[] };

const ROWS = 15;

const FLOORS = [0, 1, 5] as const;

export default function PriceMovers({
  windows,
  currency = '$',
}: {
  windows: {
    label: string;
    span: string;
    counts: Record<number, number>;
    movers: Named[];
  }[];
  currency?: string;
}) {
  const [windowAt, setWindowAt] = useState(0);
  const [by, setBy] = useState<'percent' | 'delta'>('percent');
  const [floor, setFloor] = useState<number>(1);

  const chosen = windows[windowAt] ?? windows[0];

  const { risers, fallers } = useMemo(() => {
    const pool = by === 'percent' ? chosen.movers.filter((m) => m.from >= floor) : chosen.movers;
    const sorted = [...pool].sort((a, b) => b[by] - a[by]);
    return {
      risers: sorted.filter((m) => m.delta > 0).slice(0, ROWS),
      fallers: sorted
        .filter((m) => m.delta < 0)
        .slice(-ROWS)
        .reverse(),
    };
  }, [chosen, by, floor]);

  const counted = chosen.counts[by === 'percent' ? floor : 0] ?? 0;

  return (
    <>
      <div className="window-bar">
        <div className="window-chips" role="group" aria-label="Window">
          {windows.map((w, i) => (
            <button
              key={w.label}
              type="button"
              className="window-chip"
              aria-pressed={windowAt === i}
              onClick={() => setWindowAt(i)}
            >
              {w.label}
            </button>
          ))}
        </div>

        <div className="window-chips" role="group" aria-label="Sort by">
          <button
            type="button"
            className="window-chip"
            aria-pressed={by === 'percent'}
            onClick={() => setBy('percent')}
          >
            By %
          </button>
          <button
            type="button"
            className="window-chip"
            aria-pressed={by === 'delta'}
            onClick={() => setBy('delta')}
          >
            By {currency}
          </button>
        </div>

        {by === 'percent' ? (
          <div className="window-chips" role="group" aria-label="Ignore cards under">
            {FLOORS.map((f) => (
              <button
                key={f}
                type="button"
                className="window-chip"
                aria-pressed={floor === f}
                onClick={() => setFloor(f)}
              >
                {f === 0 ? 'Any price' : `${currency}${f}+`}
              </button>
            ))}
          </div>
        ) : null}

        <span className="window-count">
          <b>{counted.toLocaleString('en-US')}</b> cards moved · {chosen.span}
        </span>
      </div>

      <p className="muted source-line" style={{ maxWidth: '76ch', marginTop: '1rem' }}>
        Lowest listed price, from one source, and only the days it actually changed —
        a card that has not moved is not here rather than being here at zero.{' '}
        {by === 'percent' && floor > 0 ? (
          <>
            Cards under {currency}
            {floor} are left out of this ranking: at that price a one-cent tick is a
            double-digit percentage.
          </>
        ) : by === 'percent' ? (
          <>
            <strong>No floor:</strong> the top of this list is cheap cards where one cent
            is a large percentage.
          </>
        ) : (
          <>Ranked by cash, so it selects for expensive cards on its own.</>
        )}
      </p>

      <div className="movers">
        <Column title="Up" rows={risers} by={by} currency={currency} />
        <Column title="Down" rows={fallers} by={by} currency={currency} />
      </div>
    </>
  );
}

function Column({
  title,
  rows,
  by,
  currency,
}: {
  title: string;
  rows: Named[];
  by: 'percent' | 'delta';
  currency: string;
}) {
  return (
    <div>
      <div className="section-head" style={{ marginTop: '1.6rem' }}>
        <h2 className="display">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="empty">Nothing here in this window.</p>
      ) : (
        <div className="table-scroll">
          <table className="meta-table">
            <thead>
              <tr>
                <th>Card</th>
                <th style={{ textAlign: 'right' }}>Was</th>
                <th style={{ textAlign: 'right' }}>Now</th>
                <th style={{ textAlign: 'right' }}>{by === 'percent' ? 'Change' : 'Change'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/cards/${m.id.toLowerCase()}`} className="meta-leader">
                      <img src={art(m.id, 96)} alt="" loading="lazy" />
                      <span style={{ minWidth: 0 }}>
                        <span className="meta-leader-name" style={{ display: 'block' }}>
                          {m.name}
                        </span>
                        <span className="meta-leader-id">
                          {m.colors.join('/')} · {m.id}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="mono muted" style={{ textAlign: 'right' }}>
                    {currency}
                    {m.from.toFixed(2)}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {currency}
                    {m.to.toFixed(2)}
                  </td>
                  <td
                    className={`mono mover-change ${m.delta > 0 ? 'up' : 'down'}`}
                    style={{ textAlign: 'right', whiteSpace: 'nowrap' }}
                  >
                    {m.percent > 0 ? '+' : ''}
                    {m.percent.toFixed(0)}%
                    <span className="muted" style={{ fontSize: '0.76rem' }}>
                      {' '}
                      {m.delta > 0 ? '+' : '−'}
                      {currency}
                      {Math.abs(m.delta).toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
