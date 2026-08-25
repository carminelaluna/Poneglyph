'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { art } from '@/lib/art';
import type { Printing } from '@/lib/cards';
import { formatPrice } from '@/lib/cards';

/**
 * The card art and its other printings.
 *
 * Picking a printing swaps the art in place — it does not navigate, and it does
 * not open the raw image file in another tab, which is what the thumbnails used
 * to do. Clicking the art opens a lightbox that fits the image to the viewport
 * instead of showing it at its natural pixel size.
 */
export default function CardViewer({
  cardId,
  name,
  printings,
}: {
  cardId: string;
  name: string;
  printings: Printing[];
}) {
  const [selected, setSelected] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const printing = printings[selected] ?? printings[0];

  const close = useCallback(() => setZoomed(false), []);

  /* Escape closes, and arrows move between printings while zoomed. */
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') setSelected((i) => (i + 1) % printings.length);
      if (e.key === 'ArrowLeft') setSelected((i) => (i - 1 + printings.length) % printings.length);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [zoomed, close, printings.length]);

  return (
    <div className="card-art">
      <button
        type="button"
        className="card-art-open"
        onClick={() => setZoomed(true)}
        aria-label={`Enlarge ${name}, ${printing?.label ?? cardId}`}
      >
        <img
          src={art(printing?.id ?? cardId, 600)}
          alt={`${name} (${printing?.label ?? cardId})`}
          width={600}
          height={838}
        />
        <span className="card-art-hint" aria-hidden="true">
          Click to enlarge
        </span>
      </button>

      {printings.length > 1 ? (
        <>
          <div className="variants" role="group" aria-label="Printings">
            {printings.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className="variant"
                aria-current={i === selected}
                aria-label={`${p.label} — ${p.variant}, ${p.rarity}`}
                title={`${p.label} · ${p.variant}${
                  p.price?.market ? ` · ${formatPrice(p.price.market)}` : ''
                }`}
                onClick={() => setSelected(i)}
              >
                <img src={art(p.id, 96)} alt="" loading="lazy" />
                <span className="variant-tag">{i === 0 ? 'V1' : `V${p.version}`}</span>
              </button>
            ))}
          </div>
          <p className="variant-caption mono">
            {printing?.label} · {printing?.variant} · {printing?.rarity}
          </p>
        </>
      ) : null}

      {zoomed ? (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${name}, ${printing?.label ?? cardId}`}
          onClick={close}
        >
          <button ref={closeRef} type="button" className="lightbox-close" onClick={close}>
            Close
          </button>
          <img
            src={art(printing?.id ?? cardId, 600)}
            alt={`${name} (${printing?.label ?? cardId})`}
            onClick={(e) => e.stopPropagation()}
          />
          {printings.length > 1 ? (
            <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
              {printings.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className="lightbox-pip"
                  aria-current={i === selected}
                  aria-label={p.label}
                  onClick={() => setSelected(i)}
                >
                  {i === 0 ? 'V1' : `V${p.version}`}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
