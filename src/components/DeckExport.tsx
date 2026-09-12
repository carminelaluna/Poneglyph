'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type ExportCard = { id: string; count: number };

const base = (id: string) => id.replace(/_[a-z]\d*$/i, '');

export default function DeckExport({
  leaderId,
  cards,
}: {
  leaderId: string;
  cards: ExportCard[];
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const text = useMemo(
    () => [`1x${base(leaderId)}`, ...cards.map((c) => `${c.count}x${base(c.id)}`)].join('\n'),
    [leaderId, cards]
  );

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2200);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      try {
        const field = document.createElement('textarea');
        field.value = text;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(field);
        setState(ok ? 'copied' : 'failed');
      } catch {
        setState('failed');
      }
    }
  }, [text]);

  return (
    <div className="deck-export">
      <button type="button" className="chip deck-export-button" onClick={copy}>
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Could not copy' : 'Copy for simulator'}
      </button>
      <span className="muted">
        {cards.reduce((n, c) => n + c.count, 0) + 1} cards · paste into Import from clipboard
      </span>
    </div>
  );
}
