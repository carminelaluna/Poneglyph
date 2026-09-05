/**
 * Reading `.env.local` the way Next does.
 *
 * This lived as two byte-identical copies in `build-static.mjs` and
 * `deploy-site.mjs`, plus a third partial one in `serve-static.mjs`, and none of
 * them was reachable by a test because each was tangled up with reading files.
 * `parseEnv` is the half with the decisions in it, so it is the half that moved.
 *
 * What it decides matters more than it looks: a variable this misses is a build
 * refusing a correctly configured checkout, or a deploy pointed at the wrong CDN.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ENV_FILES, parseEnv } from '../scripts/env.mjs';

const read = (text: string) => Object.fromEntries(parseEnv(text) as Map<string, string>);

describe('reading env files', () => {
  it('reads a plain assignment', () => {
    assert.deepEqual(read('NEXT_PUBLIC_BASE_PATH=/Poneglyph'), {
      NEXT_PUBLIC_BASE_PATH: '/Poneglyph',
    });
  });

  /* Both spellings turn up in a file people edit by hand, and they mean one thing. */
  it('takes the quotes off, either kind', () => {
    assert.equal(read('A="one"').A, 'one');
    assert.equal(read("A='one'").A, 'one');
    assert.equal(read('A=one').A, 'one');
  });

  it('tolerates the whitespace a person leaves behind', () => {
    assert.equal(read('  A =  one  ').A, 'one');
  });

  /*
   * A stray note or a blank line should not take a deploy down. These files are
   * edited by hand and the cost of being strict is a failed build over a comment.
   */
  it('skips anything that is not an assignment', () => {
    assert.deepEqual(read('# a note\n\nnot an assignment\nA=1'), { A: '1' });
  });

  it('keeps an empty value rather than dropping the key', () => {
    assert.deepEqual(read('NEXT_PUBLIC_BASE_PATH='), { NEXT_PUBLIC_BASE_PATH: '' });
  });

  /*
   * First wins, which is what `??=` does when the caller walks the files in order —
   * so `.env.local` overrides `.env`, the precedence Next uses.
   */
  it('keeps the first of a repeated key', () => {
    assert.equal(read('A=first\nA=second').A, 'first');
  });

  it('does not mistake a value containing = for two assignments', () => {
    assert.equal(read('URL=https://x/?a=1&b=2').URL, 'https://x/?a=1&b=2');
  });

  it('reads .env.local before .env, as Next does', () => {
    assert.deepEqual(ENV_FILES, ['.env.local', '.env']);
  });
});
