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
  hoursSince,
  isNetworkRefusal,
  isRefusal,
  refusal,
  STALE_AFTER_HOURS,
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

/*
 * How long a refusal may last before it is a problem of ours after all.
 *
 * Exiting 0 on a refusal is right for one run and wrong for twenty, and it was
 * wrong for twenty: update-spoilers runs four times a day and spent five days
 * green while the host turned the runner away, so the page showed twelve-day-old
 * reveals and the run list said everything was fine. What surfaced it was a person
 * looking at the page, which is the one thing a schedule exists to avoid.
 */
describe('a refusal that has gone on too long', () => {
  const hour = 3_600_000;
  const now = Date.parse('2026-09-04T00:00:00Z');
  const ago = (hours: number) => new Date(now - hours * hour).toISOString();

  it('measures the age of what is on disk', () => {
    assert.equal(hoursSince(ago(0), now), 0);
    assert.equal(hoursSince(ago(6), now), 6);
    assert.equal(Math.round(hoursSince(ago(120), now)!), 120);
  });

  /* A first run, or a file with no timestamp, has nothing to be stale about. */
  it('has no opinion when there is no timestamp', () => {
    assert.equal(hoursSince(null, now), null);
    assert.equal(hoursSince(undefined, now), null);
    assert.equal(hoursSince('not a date', now), null);
  });

  it('is generous enough to sit through a bad weekend', () => {
    assert.ok(STALE_AFTER_HOURS >= 48, 'a blocked weekend must not redden the schedule');
    assert.ok(STALE_AFTER_HOURS <= 96, 'a week of silence is too long to go unreported');
  });

  const spawn = (script: string) =>
    run(process.execPath, ['--input-type=module', '-e', script], { cwd: root });

  it('stays green while the data on disk is still fresh', async () => {
    const { stdout } = await spawn(`
      import { exitOnFailure } from './scripts/refusal.mjs';
      exitOnFailure('spoilers', new Error('fetch failed'), 'nothing written', {
        since: new Date(Date.now() - 6 * 3600e3).toISOString(),
      });
    `);
    assert.match(stdout, /::warning title=spoilers upstream refused/);
  });

  it('goes red once the archive has been frozen for days', async () => {
    await assert.rejects(
      spawn(`
        import { exitOnFailure } from './scripts/refusal.mjs';
        exitOnFailure('spoilers', new Error('fetch failed'), 'nothing written', {
          since: new Date(Date.now() - 120 * 3600e3).toISOString(),
        });
      `),
      (err: NodeJS.ErrnoException & { code?: number; stdout?: string; stderr?: string }) => {
        assert.equal(err.code, 1);
        assert.match(err.stdout ?? '', /::error title=spoilers has been refused for days/);
        assert.match(err.stderr ?? '', /5d 0h old/);
        return true;
      }
    );
  });

  /* Without a timestamp it must behave exactly as it did before any of this. */
  it('stays green when it cannot tell how old the data is', async () => {
    const { stdout } = await spawn(`
      import { exitOnFailure } from './scripts/refusal.mjs';
      exitOnFailure('topdecks', new Error('fetch failed'), 'nothing written');
    `);
    assert.match(stdout, /::warning title=topdecks upstream refused/);
  });
});
