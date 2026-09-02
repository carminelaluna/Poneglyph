/**
 * Poneglyph — telling a refusal apart from a breakage.
 *
 * Pure and free of imports, so a test can run it, and shared because two ingests
 * read the same host: `ingest-spoilers.mjs` and `ingest-topdecks.mjs` both go to
 * onepiecetopdecks.com, which sits behind a filter that turns datacenter IPs away.
 * Two copies of this judgement would drift, and the one that drifted would either
 * start failing a scheduled job for someone else's filter or stop failing for our
 * own broken parser. It lives here for the same reason the rate limiter lives in
 * `limitless.mjs`.
 *
 * The distinction, and it is the whole point of the file:
 *
 * **A refusal** is the upstream declining to talk to us — a 403, 429 or 503, a
 * connection that never completed, or a body that is plainly a challenge page.
 * Nothing is written, the last good data stands, the run says so and exits 0. A
 * schedule that runs every few hours cannot be red for something outside this
 * repository and still be read by anybody.
 *
 * **Everything else is a breakage** and still exits 1: a shape that changed, a
 * parse that broke, a file that would not write. Those are ours to fix, and the
 * point of exiting 0 on a refusal is that it makes the red runs mean something.
 *
 * What this file cannot see is the third case, which is a refusal wearing a
 * successful answer: on 2026-09-02 this host served forty pages as clean 200s
 * holding no decks. Nothing about the transport was wrong, so nothing here would
 * have caught it. That one is `corpus-guard.mjs`, which asks a different question
 * — not "did they answer" but "is the answer smaller than what we already have".
 */

/** Seconds. The filter clears in tens of seconds, so sub-second retries all land
 *  inside one blocked window and prove nothing. Four attempts across a minute is
 *  free on a cron job with nothing waiting on it. */
export const BACKOFF = [3, 10, 30];

/** Statuses that mean "not now" rather than "not ever". */
export const TURNED_AWAY = [403, 429, 503];

/** An error marked as the upstream's decision rather than our mistake. */
export const refusal = (message) => Object.assign(new Error(message), { refused: true });

/**
 * A connection that never completed is a refusal too — arguably a plainer one
 * than a challenge page. `fetch failed` is what undici raises for a reset, a DNS
 * miss or a TLS handshake that went nowhere, and AbortError is our own timeout.
 * None of them is this repository having got something wrong.
 */
export function isNetworkRefusal(err) {
  return (
    err?.name === 'TimeoutError' ||
    err?.name === 'AbortError' ||
    /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(err?.message ?? '')
  );
}

/** Already marked, or recognisable as the upstream turning us away. */
export const isRefusal = (err) => Boolean(err?.refused) || isNetworkRefusal(err);

/**
 * The error to throw once the retries are spent: a refusal if the upstream would
 * not talk to us, an ordinary failure otherwise.
 */
export const finalError = (url, err) =>
  isRefusal(err) ? refusal(`${url}: ${err.message}`) : new Error(`${url}: ${err.message}`);

/**
 * The `main().catch` every one of these ingests ends with.
 *
 * `kept` is the sentence saying what the archive still holds, which is the part a
 * reader of a green-with-warning run actually needs: that nothing was lost.
 */
export function exitOnFailure(tag, err, kept) {
  if (isRefusal(err)) {
    console.error(`[${tag}] upstream refused —`, err.message);
    if (kept) console.error(`[${tag}] ${kept}`);
    console.log(`::warning title=${tag} upstream refused::${err.message}`);
    process.exit(0);
  }

  console.error(`[${tag}] FAILED —`, err.message);
  process.exit(1);
}
