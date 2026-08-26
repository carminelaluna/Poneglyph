'use client';

import { useEffect, useState } from 'react';

/**
 * Back to the top.
 *
 * The pages that need it are long by nature — 2,785 cards in a grid, 67 events, a
 * Swiss field of 64 — and on those the header scrolls away entirely.
 *
 * It appears only once there is something to scroll back from. A button that is
 * present on a short page is a permanent thing covering the corner for no reason.
 */
export default function BackToTop() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    /*
     * passive: this never calls preventDefault, and saying so lets the browser keep
     * scrolling while the handler runs rather than waiting on it.
     */
    const onScroll = () => setShown(globalThis.scrollY > 900);
    onScroll();
    globalThis.addEventListener('scroll', onScroll, { passive: true });
    return () => globalThis.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      type="button"
      className={`to-top${shown ? ' to-top-shown' : ''}`}
      /* Hidden from the tab order too when it is invisible, not just from view. */
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
      aria-label="Back to top"
      onClick={() =>
        globalThis.scrollTo({
          top: 0,
          /* Honour a reader who has asked the system for less motion. */
          behavior: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        })
      }
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
        <path
          d="M7 12V3M7 2.5 2.5 7M7 2.5 11.5 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>Top</span>
    </button>
  );
}
