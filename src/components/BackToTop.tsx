'use client';

import { useEffect, useState } from 'react';

export default function BackToTop() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(globalThis.scrollY > 900);
    onScroll();
    globalThis.addEventListener('scroll', onScroll, { passive: true });
    return () => globalThis.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      type="button"
      className={`to-top${shown ? ' to-top-shown' : ''}`}
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
      aria-label="Back to top"
      onClick={() =>
        globalThis.scrollTo({
          top: 0,
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
