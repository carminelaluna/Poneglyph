'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type ExportCard = { id: string; count: number };

/**
 * Copy a decklist for OPTCGSim.
 *
 * One button, one format. It used to open a dialog offering four — simulator, one
 * line, annotated, CSV — with a copy and a download for each. The simulator format
 * is the one that was asked for and the only one with a destination; the rest were
 * choices to read past on the way to it.
 *
 * `{count}x{cardId}`, one per line, Leader first, which is what the simulator's
 * "Import from clipboard" reads.
 */

/** `OP01-025_p2` -> `OP01-025`. Printings are the same card to a deckbuilder. */
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

  /* Say "copied" for a moment, then go back to offering. */
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
      /*
       * The Clipboard API needs a secure context and permission, and refuses in a
       * few browsers. Falling back to the old command keeps the button working
       * rather than leaving it silently dead.
       */
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
