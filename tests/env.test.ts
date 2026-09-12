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

  it('takes the quotes off, either kind', () => {
    assert.equal(read('A="one"').A, 'one');
    assert.equal(read("A='one'").A, 'one');
    assert.equal(read('A=one').A, 'one');
  });

  it('tolerates the whitespace a person leaves behind', () => {
    assert.equal(read('  A =  one  ').A, 'one');
  });

  it('skips anything that is not an assignment', () => {
    assert.deepEqual(read('# a note\n\nnot an assignment\nA=1'), { A: '1' });
  });

  it('keeps an empty value rather than dropping the key', () => {
    assert.deepEqual(read('NEXT_PUBLIC_BASE_PATH='), { NEXT_PUBLIC_BASE_PATH: '' });
  });

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
