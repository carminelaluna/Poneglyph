/**
 * Telling a refusal apart from a breakage.
 *
 * This judgement decides an exit code, and an exit code is the only thing anyone
 * reads about a scheduled run. Get it wrong in one direction and a job goes red
 * every few hours for a filter outside this repository, until nobody looks at it;
 * get it wrong in the other and a genuinely broken parser reports success forever.
 *
 * Two ingests share it because two ingests read the same host, and the exit-code
 * half is spawned rather than called: `exitOnFailure` ends in `process.exit`, so
 * asserting on it in-process would take the test runner down with it. That is the
 * same lesson `tests/ingest-submissions.test.ts` records — a script's own guards
 * need something that actually runs them.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';
import {
  BACKOFF,
  finalError,
  isNetworkRefusal,
  isRefusal,
  refusal,
  TURNED_AWAY,
} from '../scripts/refusal.mjs';

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');

describe('what counts as a refusal', () => {
  it('marks an error the upstream caused', () => {
    const err = refusal('HTTP 403 — the upstream turned us away');
    assert.equal(err.refused, true);
    assert.equal(isRefusal(err), true);
  });

  /*
   * `fetch failed` is what undici raises for a reset, a DNS miss or a TLS
   * handshake that went nowhere, and it is what a scheduled run hit reaching the
   * Top Decks index. Before this it exited 1.
   */
  it('recognises a connection that never completed', () => {
    for (const message of [
      'fetch failed',
      'read ECONNRESET',
      'connect ETIMEDOUT 1.2.3.4:443',
      'getaddrinfo ENOTFOUND onepiecetopdecks.com',
      'getaddrinfo EAI_AGAIN onepiecetopdecks.com',
    ]) {
      assert.equal(isNetworkRefusal(new Error(message)), true, message);
    }
    assert.equal(isNetworkRefusal(Object.assign(new Error('x'), { name: 'TimeoutError' })), true);
    assert.equal(isNetworkRefusal(Object.assign(new Error('x'), { name: 'AbortError' })), true);
  });

  /*
   * The narrowness is the point. A 200 of real JSON that fails to parse, or a
   * shape that changed, is a broken assumption of ours and has to stay fatal —
   * otherwise the exit code stops distinguishing anything.
   */
  it('does not mistake our own mistakes for a refusal', () => {
    for (const message of [
      "Unexpected token 'x', \"xyz\" is not valid JSON",
      'HTTP 404',
      'HTTP 500',
      'decks is not iterable',
      'EACCES: permission denied, open data/decks-en.json',
    ]) {
      assert.equal(isRefusal(new Error(message)), false, message);
    }
    assert.equal(isRefusal(undefined), false);
    assert.equal(isRefusal(null), false);
  });

  it('turns away on not-now statuses only', () => {
    assert.deepEqual(TURNED_AWAY, [403, 429, 503]);
    for (const status of [404, 410, 500, 502]) {
      assert.ok(!TURNED_AWAY.includes(status), `${status} is ours to fix, not theirs`);
    }
  });

  it('keeps the mark through finalError, and does not invent one', () => {
    assert.equal(isRefusal(finalError('https://x/', refusal('turned away'))), true);
    assert.equal(isRefusal(finalError('https://x/', new Error('fetch failed'))), true);
    assert.equal(isRefusal(finalError('https://x/', new Error('HTTP 500'))), false);
    /* The URL is carried, because "fetch failed" alone names nothing. */
    assert.match(finalError('https://x/y', new Error('fetch failed')).message, /https:\/\/x\/y/);
  });

  /*
   * Seconds, not milliseconds. The filter clears in tens of seconds, so the old
   * 0.7s/2.8s backoff put every attempt inside one blocked window.
   */
  it('backs off in seconds', () => {
    assert.deepEqual(BACKOFF, [3, 10, 30]);
    assert.ok(BACKOFF[0] >= 1, 'a sub-second first retry lands in the same blocked window');
  });
});

describe('the exit code a refusal produces', () => {
  const spawn = (script: string) =>
    run(process.execPath, ['--input-type=module', '-e', script], { cwd: root });

  it('exits 0 and annotates the run, leaving the data alone', async () => {
    const { stdout } = await spawn(`
      import { exitOnFailure, refusal } from './scripts/refusal.mjs';
      exitOnFailure('topdecks', refusal('HTTP 503'), 'nothing written');
    `);
    assert.match(stdout, /::warning title=topdecks upstream refused::HTTP 503/);
  });

  it('exits 0 for a connection that never completed', async () => {
    await spawn(`
      import { exitOnFailure } from './scripts/refusal.mjs';
      exitOnFailure('topdecks', new Error('fetch failed'), 'nothing written');
    `);
  });

  it('still exits 1 for anything else', async () => {
    await assert.rejects(
      spawn(`
        import { exitOnFailure } from './scripts/refusal.mjs';
        exitOnFailure('topdecks', new Error('decks is not iterable'), 'nothing written');
      `),
      (err: NodeJS.ErrnoException & { code?: number; stderr?: string }) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr ?? '', /FAILED — decks is not iterable/);
        return true;
      }
    );
  });
});
