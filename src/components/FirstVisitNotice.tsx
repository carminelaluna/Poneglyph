'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Disclaimer } from './Footer';

/**
 * The Bandai notice, once, on a first visit.
 *
 * It is an *addition*, not a move. The footer keeps a one-line version on every
 * page, because a notice you can dismiss is a notice most readers will never have
 * seen: they arrive on a card page from a search engine, and whether this site is
 * official has to be answerable there, not only in a banner somebody clicked away
 * on a different day. What the banner does is put the full text in front of the
 * one person who has not read it yet, instead of at the foot of all 4,700 pages.
 *
 * Dismissal lives in `localStorage`, which is per browser and per device. That is
 * the right grain: it is a reading, not a consent, so there is nothing to record
 * anywhere else — and nothing here asks the reader for a decision, which is why it
 * is one button and not two.
 */

/** Bumping this shows the notice again, which is the point of versioning it. */
const SEEN = 'poneglyph:notice:1';

export default function FirstVisitNotice() {
  /*
   * Never on the server. The export is static and the same HTML is served to
   * everybody, so rendering this during SSR would either show it to a reader who
   * had dismissed it or flash it away on hydration. It appears after mount or not
   * at all.
   */
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN)) setShow(true);
    } catch {
      /*
       * A browser refusing storage is a browser that will ask again next time,
       * which is a worse outcome than seeing it once — but it is a far better one
       * than a page that throws while telling somebody who owns the artwork.
       */
      setShow(true);
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(SEEN, '1');
    } catch {
      /* Nothing to do: it will be shown again, and that is the safe direction. */
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
