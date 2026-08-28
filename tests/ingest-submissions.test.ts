/**
 * The submissions ingest, run as the scheduled job runs it.
 *
 * `scripts/submissions.mjs` is unit-tested next door; this is about the script that
 * wraps it, and specifically about the paths that touch no network and write no
 * files — which are also the paths nothing else can reach.
 *
 * It exists because of a regression it would have caught in a second. Extracting
 * `toDecks` into its own module took `CONFIGURED` and `fromSupabase` out with it,
 * and the extraction was verified with `--fixture` — the one mode that evaluates
 * neither. `node --check` parses and sees nothing wrong; `tsc` does not read .mjs.
 * The scheduled run found it, six hours later, by failing.
 *
 * So: spawn it, the way CI does, and read the exit code.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const script = path.join(root, 'scripts', 'ingest-submissions.mjs');

/** The script with a chosen environment, and nothing inherited that could confuse it. */
function run(env: Record<string, string | undefined>, args: string[] = []) {
  const clean = { ...process.env };
  for (const key of Object.keys(clean)) {
    if (key.startsWith('SUPABASE_') || key.startsWith('NEXT_PUBLIC_SUPABASE_')) delete clean[key];
  }

  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...clean, ...env },
    timeout: 60_000,
  });

  return { status: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

describe('the submissions ingest', () => {
  /*
   * The regression. A checkout with no project behind it is a real answer, not a
   * failure — the site builds without accounts — and the scheduled deck workflow
   * runs this in the same job as the ingest that spends thirty minutes on a rate
   * limit, so a wrong exit code here throws that away.
   */
  it('skips cleanly when there is no Supabase project at all', () => {
    const { status, out } = run({});
    assert.equal(status, 0, `expected a clean skip, got ${status}:\n${out}`);
    assert.match(out, /no Supabase project configured/);
    assert.doesNotMatch(out, /is not defined/, 'a binding went missing');
  });

  /*
   * Half configured is a misconfiguration and says which half is missing. This is
   * the shape the workflow was in for a day: a URL read from a repository secret
   * that had never been created.
   */
  it('refuses a half-configured environment and names the missing half', () => {
    const withUrl = run({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' });
    assert.equal(withUrl.status, 1);
    assert.match(withUrl.out, /half configured/);
    assert.match(withUrl.out, /service role key is missing/);

    const withKey = run({ SUPABASE_SERVICE_ROLE_KEY: 'not-a-real-key' });
    assert.equal(withKey.status, 1);
    assert.match(withKey.out, /no project URL/);
  });

  /* The URL is not a secret, so either name carries it. */
  it('reads the project URL from either name', () => {
    for (const name of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']) {
      const { out } = run({ [name]: 'https://example.supabase.co' });
      assert.match(out, /the project URL is set but/, `${name} was not read`);
    }
  });

  /*
   * Fully configured against a host that does not resolve: it must get as far as
   * the request and fail on the network, rather than on a binding that is not
   * there. That distinction is the whole point of this file.
   */
  it('reaches the request when it is configured', () => {
    const { status, out } = run({
      SUPABASE_URL: 'https://nonexistent.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'not-a-real-key',
    });
    assert.equal(status, 1);
    assert.match(out, /FAILED/);
    assert.doesNotMatch(out, /is not defined/, 'a binding went missing on the configured path');
  });
});
