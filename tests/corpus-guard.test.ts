import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { KEEP_AT_LEAST, refusesWrite } from '../scripts/corpus-guard.mjs';

describe('refusing to overwrite a corpus', () => {
  it('refuses nothing over something, which is the failure it was written for', () => {
    assert.equal(refusesWrite(0, 5908), true);
    assert.equal(refusesWrite(0, 6034), true);
    assert.equal(refusesWrite(0, 1), true);
  });

  it('writes anything at all when there is nothing on disk', () => {
    assert.equal(refusesWrite(6034, 0), false);
    assert.equal(refusesWrite(0, 0), false);
    assert.equal(refusesWrite(1, 0), false);
  });

  it('writes an archive that grew, which is the normal run', () => {
    assert.equal(refusesWrite(6037, 6034), false);
    assert.equal(refusesWrite(5920, 5908), false);
  });

  it('writes an archive that shrank a little', () => {
    assert.equal(refusesWrite(6000, 6034), false);
    assert.equal(refusesWrite(3100, 6034), false);
  });

  it('refuses an archive that lost more than half', () => {
    assert.equal(refusesWrite(2000, 6034), true);
    assert.equal(refusesWrite(12, 6034), true);
  });

  it('puts the boundary exactly where the threshold says', () => {
    const held = 1000;
    const floor = Math.floor(held * KEEP_AT_LEAST);
    assert.equal(refusesWrite(floor, held), false, 'the floor itself is allowed');
    assert.equal(refusesWrite(floor - 1, held), true, 'one below the floor is refused');
  });

  it('takes a threshold, so a caller can be stricter than the default', () => {
    assert.equal(refusesWrite(900, 1000, 0.95), true);
    assert.equal(refusesWrite(900, 1000, 0.5), false);
  });

  it('refuses an empty answer even where the threshold rounds to nothing', () => {
    assert.equal(Math.floor(1 * KEEP_AT_LEAST), 0, 'the floor is zero here');
    assert.equal(refusesWrite(0, 1), true);
    assert.equal(refusesWrite(1, 1), false);
  });
});
