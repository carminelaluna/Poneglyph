import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const script = path.join(root, 'scripts', 'ingest-submissions.mjs');

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
  it('skips cleanly when there is no Supabase project at all', () => {
    const { status, out } = run({});
    assert.equal(status, 0, `expected a clean skip, got ${status}:\n${out}`);
    assert.match(out, /no Supabase project configured/);
    assert.doesNotMatch(out, /is not defined/, 'a binding went missing');
  });

  it('refuses a half-configured environment and names the missing half', () => {
    const withUrl = run({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' });
    assert.equal(withUrl.status, 1);
    assert.match(withUrl.out, /half configured/);
    assert.match(withUrl.out, /service role key is missing/);

    const withKey = run({ SUPABASE_SERVICE_ROLE_KEY: 'not-a-real-key' });
    assert.equal(withKey.status, 1);
    assert.match(withKey.out, /no project URL/);
  });

  it('reads the project URL from either name', () => {
    for (const name of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']) {
      const { out } = run({ [name]: 'https://example.supabase.co' });
      assert.match(out, /the project URL is set but/, `${name} was not read`);
    }
  });

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
