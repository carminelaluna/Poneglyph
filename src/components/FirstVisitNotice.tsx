'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Disclaimer } from './Footer';

const SEEN = 'poneglyph:notice:1';

export default function FirstVisitNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN)) setShow(true);
    } catch {
      setShow(true);
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(SEEN, '1');
    } catch {
    }
  };

  if (!show) return null;

  return (
    <div className="notice-bar" role="region" aria-label="About this site">
      <div className="notice-inner">
        <Disclaimer />
        <div className="notice-actions">
          <Link href="/legal" className="inline-link notice-more">
            Read the full notice
          </Link>
          <button type="button" className="chip chip-solid" onClick={dismiss}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
