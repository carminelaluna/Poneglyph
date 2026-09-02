/**
 * Poneglyph — when an ingest must refuse to overwrite a corpus.
 *
 * Pure and free of imports, so a test can run it. That is the whole reason it is
 * a file rather than eight lines inside `ingest-topdecks.mjs`: the guard is the
 * only thing standing between an upstream having a bad morning and the archive
 * being emptied, and a guard nothing exercises is a guard that can silently
 * invert. `matchups.mjs`, `price-history.mjs` and `submissions.mjs` moved out of
 * their scripts for the same reason.
 *
 * The failure it exists for, in full. On 2026-09-02 a scheduled run read the Top
 * Decks archives from a GitHub runner and every one of the forty pages came back
 * as a 200 that parsed cleanly and held no decks — the host answers some
 * datacenter IPs with a challenge, which CLAUDE.md already records for this
 * domain, and which had until then surfaced as HTML where JSON was promised. The
 * ingest wrote both corpora away to nothing. The same command from a home
 * connection read 6,037 and 5,920. What made that a data loss rather than a bad
 * morning is that nothing between the empty answer and the write said no.
 */

/**
 * How much of a corpus may vanish between two runs before the result is refused.
 *
 * These are per-set archive pages: a set closes and its page stops changing, so
 * the count only ever grows. A run that comes back with less than half of what is
 * already recorded has not found a smaller archive, it has been answered with
 * something that is not the archive.
 *
 * Half is deliberately loose. The number this has to catch is zero, and the
 * shapes next likeliest are "the filter blocked most of the pages" and "a URL
 * prefix changed and a region's pages stopped matching" — all of which take far
 * more than half. Setting it tight enough to catch a 10% dip would start refusing
 * real answers, and a guard that cries wolf gets removed.
 */
export const KEEP_AT_LEAST = 0.5;

/**
 * Should this run refuse to write what it found?
 *
 * `held` is what is already on disk. A first run has nothing to protect and
 * writes whatever it got, including nothing — otherwise a fresh checkout could
 * never build a corpus at all.
 */
export function refusesWrite(found, held, keepAtLeast = KEEP_AT_LEAST) {
  /* Nothing on disk to protect: a fresh checkout has to be able to build one. */
  if (!(held > 0)) return false;
  /*
   * An empty answer is never an archive, whatever the threshold works out to.
   * This line is also what covers a corpus of one, where the floor below rounds
   * to zero — the first version guarded that with a `Math.max(1, ...)` on the
   * floor, which reads as though it does something and cannot: by the time
   * execution reaches it, `found` is at least 1 and `found < 0` is as false as
   * `found < 1`. A mutation test that deleted the Math.max passed unchanged,
   * which is how it was found.
   */
  if (!(found > 0)) return true;
  return found < Math.floor(held * keepAtLeast);
}
