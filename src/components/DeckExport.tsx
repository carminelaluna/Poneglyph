'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type ExportCard = { id: string; count: number };

/**
 * Decklist export.
 *
 * A button rather than a permanent block: the list is already on the page as card
 * images, and a textarea sitting under it was a third copy of the same information.
 * Exporting is something you do once, so it opens when asked and gets out of the way.
 *
 * The default format is what OPTCGSim reads — `{count}x{cardId}`, one per line,
 * Leader first — so a copy here is a playable deck there with nothing in between.
 */

/** `OP01-025_p2` -> `OP01-025`. Printings are the same card to a deckbuilder. */
const base = (id: string) => id.replace(/_[a-z]\d*$/i, '');

const FORMATS = {
  sim: {
    label: 'Simulator',
    blurb: 'OPTCGSim — paste into Import from clipboard',
    ext: 'txt',
    render: (leaderId: string, cards: ExportCard[]) =>
      [`1x${base(leaderId)}`, ...cards.map((c) => `${c.count}x${base(c.id)}`)].join('\n'),
  },
  inline: {
    label: 'One line',
    blurb: 'The same codes on a single line, for chat and forms',
    ext: 'txt',
    render: (leaderId: string, cards: ExportCard[]) =>
      [`1x${base(leaderId)}`, ...cards.map((c) => `${c.count}x${base(c.id)}`)].join(' '),
  },
  named: {
    label: 'With names',
    blurb: 'Readable list for articles and tournament reports',
    ext: 'txt',
    render: (leaderId: string, cards: ExportCard[], names: Record<string, string>) =>
      [
        `1x ${base(leaderId)}  ${names[leaderId] ?? ''}`.trimEnd(),
        ...cards.map((c) => `${c.count}x ${base(c.id)}  ${names[c.id] ?? ''}`.trimEnd()),
      ].join('\n'),
  },
  csv: {
    label: 'CSV',
    blurb: 'Spreadsheet columns: count, card number, name',
    ext: 'csv',
    render: (leaderId: string, cards: ExportCard[], names: Record<string, string>) =>
      [
        'count,card,name',
        `1,${base(leaderId)},"${(names[leaderId] ?? '').replace(/"/g, '""')}"`,
        ...cards.map(
          (c) => `${c.count},${base(c.id)},"${(names[c.id] ?? '').replace(/"/g, '""')}"`
        ),
      ].join('\n'),
  },
} as const;

type FormatKey = keyof typeof FORMATS;

export default function DeckExport({
  leaderId,
  cards,
  names = {},
  filename = 'deck',
}: {
  leaderId: string;
  cards: ExportCard[];
  names?: Record<string, string>;
  filename?: string;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<FormatKey>('sim');
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  const text = useMemo(
    () => FORMATS[format].render(leaderId, cards, names),
    [format, leaderId, cards, names]
  );
  const total = useMemo(() => cards.reduce((n, c) => n + c.count, 0), [cards]);

  const close = useCallback(() => {
    setOpen(false);
    /* Send focus back where it came from, not to the top of the document. */
    openerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard refused — the textarea is still selectable. */
      setCopied(false);
    }
  }

  function download() {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.${FORMATS[format].ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="export-actions">
        <button
          ref={openerRef}
          type="button"
          className="export-open"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        >
          Export deck
        </button>
        <span className="muted" style={{ fontSize: '0.78rem' }}>
          {total + 1} cards — simulator, plain text or CSV
        </span>
      </div>

      {open ? (
        <div className="export-overlay" role="presentation" onClick={close}>
          <div
            className="export-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Export decklist"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="export-dialog-head">
              <h2 className="display">Export deck</h2>
              <button ref={closeRef} type="button" className="control" onClick={close}>
                Close
              </button>
            </div>

            <div className="export-formats" role="radiogroup" aria-label="Format">
              {(Object.keys(FORMATS) as FormatKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={format === key}
                  className="export-format"
                  onClick={() => setFormat(key)}
                >
                  <b>{FORMATS[key].label}</b>
                  <span>{FORMATS[key].blurb}</span>
                </button>
              ))}
            </div>

            <textarea
              readOnly
              value={text}
              aria-label={`Decklist in ${FORMATS[format].label} format`}
              onFocus={(e) => e.currentTarget.select()}
            />

            <div className="export-dialog-foot">
              <button type="button" className="export-open" onClick={copy}>
                {copied ? 'Copied' : 'Copy to clipboard'}
              </button>
              <button type="button" className="control" onClick={download}>
                Download .{FORMATS[format].ext}
              </button>
              <span className="muted" style={{ fontSize: '0.74rem' }}>
                Alternate-art numbers are written as the base card, which is what deckbuilders
                expect.
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
