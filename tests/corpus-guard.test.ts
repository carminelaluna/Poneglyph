/**
 * The guard that stands between an upstream having a bad morning and an empty
 * archive.
 *
 * It exists because of a real one. A scheduled run read the Top Decks archives
 * from a GitHub runner and every page came back as a clean 200 holding no decks —
 * the host answers some datacenter IPs with a challenge — and the ingest wrote
 * both corpora away to nothing. The same command from a home connection twenty
 * hours later read 6,037 and 5,920. Nothing between the empty answer and the
 * write said no.
 *
 * So the cases below are the ones that decide whether data survives, and the
 * dangerous direction is *not* refusing when it should: a guard that quietly
 * stops guarding looks exactly like a guard that is working.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { KEEP_AT_LEAST, refusesWrite } from '../scripts/corpus-guard.mjs';

describe('refusing to overwrite a corpus', () => {
  it('refuses nothing over something, which is the failure it was written for', () => {
    assert.equal(refusesWrite(0, 5908), true);
    assert.equal(refusesWrite(0, 6034), true);
    assert.equal(refusesWrite(0, 1), true);
  });

  /*
   * A fresh checkout has no corpus to protect and must be able to build one.
   * Refusing here would mean the archive could never be created, only updated.
   */
  it('writes anything at all when there is nothing on disk', () => {
    assert.equal(refusesWrite(6034, 0), false);
    assert.equal(refusesWrite(0, 0), false);
    assert.equal(refusesWrite(1, 0), false);
  });

  it('writes an archive that grew, which is the normal run', () => {
    assert.equal(refusesWrite(6037, 6034), false);
    assert.equal(refusesWrite(5920, 5908), false);
  });

  /*
   * These pages only grow, but a handful of decks can drop out when a list is
   * corrected upstream. The guard has to be loose enough not to fire on that.
   */
  it('writes an archive that shrank a little', () => {
    assert.equal(refusesWrite(6000, 6034), false);
    assert.equal(refusesWrite(3100, 6034), false);
  });

  /* The shape of a partial block: most pages challenged, a few answered. */
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

  /*
   * A corpus of one makes the computed floor 0, so the threshold cannot decide
   * this case at all: what refuses it is the earlier "an empty answer is never an
   * archive". Worth pinning, because the first version guarded it with a
   * `Math.max(1, ...)` on the floor that could never fire — deleting that line
   * left every test here passing, which is what said it was dead.
   */
  it('refuses an empty answer even where the threshold rounds to nothing', () => {
    assert.equal(Math.floor(1 * KEEP_AT_LEAST), 0, 'the floor is zero here');
    assert.equal(refusesWrite(0, 1), true);
    assert.equal(refusesWrite(1, 1), false);
  });
});
