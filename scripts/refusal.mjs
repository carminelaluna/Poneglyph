export const BACKOFF = [3, 10, 30];

export const TURNED_AWAY = [403, 429, 503];

export const refusal = (message) => Object.assign(new Error(message), { refused: true });

export function isNetworkRefusal(err) {
  return (
    err?.name === 'TimeoutError' ||
    err?.name === 'AbortError' ||
    /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(err?.message ?? '')
  );
}

export const isRefusal = (err) => Boolean(err?.refused) || isNetworkRefusal(err);

export const finalError = (url, err) =>
  isRefusal(err) ? refusal(`${url}: ${err.message}`) : new Error(`${url}: ${err.message}`);

export const STALE_AFTER_HOURS = 72;

export async function writtenAt(file) {
  try {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(file, 'utf8')).generatedAt ?? null;
  } catch {
    return null;
  }
}

export function hoursSince(iso, now = Date.now()) {
  const then = Date.parse(iso ?? '');
  if (Number.isNaN(then)) return null;
  return (now - then) / 3_600_000;
}

export function exitOnFailure(tag, err, kept, { since = null, staleAfterHours = STALE_AFTER_HOURS } = {}) {
  if (isRefusal(err)) {
    const age = hoursSince(since);
    const stale = age !== null && age > staleAfterHours;

    console.error(`[${tag}] upstream refused —`, err.message);
    if (kept) console.error(`[${tag}] ${kept}`);
    if (age !== null) {
      console.error(`[${tag}] the data on disk is ${Math.floor(age / 24)}d ${Math.floor(age % 24)}h old`);
    }

    if (!stale) {
      console.log(`::warning title=${tag} upstream refused::${err.message}`);
      process.exit(0);
    }

    console.error(
      `[${tag}] refused for longer than ${staleAfterHours}h of staleness — failing so it is seen`
    );
    console.log(
      `::error title=${tag} has been refused for days::` +
        `Nothing written since ${since}; the upstream has been turning us away. ${err.message}`
    );
    process.exit(1);
  }

  console.error(`[${tag}] FAILED —`, err.message);
  process.exit(1);
}
