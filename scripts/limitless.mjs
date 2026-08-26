/**
 * The Limitless client, shared by the ingests that talk to it.
 *
 * Limitless advertises its own limit in a response header — `RateLimit:
 * "50-in-5min"; r=48; t=269` — so the budget here listens rather than guesses, and
 * pauses *before* the server would start refusing. Raising `--max` does not make a
 * run faster; it only makes it longer.
 *
 * This lived inside ingest-decks.mjs until a second ingest needed it. Copying it
 * would have meant two rate limiters against one server, each unaware of the other's
 * requests — which is the shape of an accidental ban rather than of a rate limit.
 */

/** A run's request budget, and the server's own window. */
export class Budget {
  constructor(max, log = () => {}) {
    this.remaining = max;
    this.spent = 0;
    /** Seconds until the server's window resets, from the last RateLimit header. */
    this.resetIn = 0;
    this.serverRemaining = Infinity;
    this.log = log;
  }

  get exhausted() {
    return this.remaining <= 0;
  }

  observe(headers) {
    const header = headers.get('ratelimit');
    if (!header) return;
    const r = header.match(/r=(\d+)/);
    const t = header.match(/t=(\d+)/);
    if (r) this.serverRemaining = Number(r[1]);
    if (t) this.resetIn = Number(t[1]);
  }

  /** Pause before the server would start refusing, rather than after. */
  async waitIfNeeded() {
    if (this.serverRemaining > 2) return;
    const seconds = Math.min(this.resetIn + 2, 320);
    this.log(`rate limit nearly spent — waiting ${seconds}s for the window to reset`);
    await new Promise((r) => setTimeout(r, seconds * 1000));
    this.serverRemaining = Infinity;
  }

  spend() {
    this.remaining--;
    this.spent++;
  }
}

/**
 * One request, counted against `budget`.
 *
 * `optional` returns null instead of throwing, for endpoints a tournament may
 * genuinely not have — an event with no pairings published is a fact about that
 * event, not a failure of the run.
 */
export async function apiGet(url, budget, { retries = 3, optional = false, agent } = {}) {
  await budget.waitIfNeeded();
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': agent ?? 'poneglyph/1.0 (+https://poneglyph.gg)' },
        signal: AbortSignal.timeout(45_000),
      });
      budget.spend();
      budget.observe(res.headers);

      if (res.status === 429) {
        const wait = Number(res.headers.get('retry-after') ?? 60);
        budget.log(`429 — backing off ${wait}s`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) {
        if (optional) return null;
        throw new Error(`${url}: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 500 * attempt ** 2));
    }
  }
  return null;
}
