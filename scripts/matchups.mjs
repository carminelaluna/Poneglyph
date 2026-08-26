/**
 * Turning a published bracket into Leader-against-Leader results.
 *
 * Pure, and its own file, because this is where a matchup can go quietly wrong: a
 * result read from the wrong side, a bye counted as a win, an unresolved player
 * folded into an archetype that never sat at that table. None of those throw, and
 * all of them move a number people read as a fact about a deck.
 *
 * `ingest-matchups.mjs` fetches; this decides what a row means.
 */

/** 1 = the first Leader won, 0 = the second did, 2 = a draw or no result. */
export const A_WON = 1;
export const B_WON = 0;
export const DRAW = 2;

const lower = (value) => String(value ?? '').toLowerCase();

/**
 * One tournament's pairings, as Leader-against-Leader rows.
 *
 * A match is kept only when **both** usernames have a decklist on record for that
 * tournament. Limitless publishes pairings for everyone who turned up and decklists
 * only for those who submitted one, so a partial field is normal — and the missing
 * side of a match is genuinely unknown. Counting it against "unknown" would invent
 * an archetype that was never played.
 *
 * A **bye** has no second player and is dropped by the same rule, which is right
 * for a different reason: nobody beat anybody.
 *
 * A **mirror** is dropped too. A deck beats itself half the time by construction,
 * and a row saying so is arithmetic dressed as a result.
 */
export function toRows(pairings, leaderByPlayer) {
  const rows = [];
  let unknown = 0;
  let mirrors = 0;

  for (const pairing of pairings ?? []) {
    const one = lower(pairing?.player1);
    const two = lower(pairing?.player2);
    const a = leaderByPlayer?.get(one);
    const b = leaderByPlayer?.get(two);

    if (!a || !b) {
      unknown++;
      continue;
    }
    if (a === b) {
      mirrors++;
      continue;
    }

    const winner = lower(pairing?.winner);
    /*
     * Anything that is not one of the two names is a draw: a timed round that ended
     * level, a double loss, a match with no result published. Both decks failed to
     * win it, which is what a draw is.
     */
    const result = winner === one ? A_WON : winner === two ? B_WON : DRAW;

    rows.push([a, b, result]);
  }

  return { rows, unknown, mirrors };
}

/**
 * One match, from each side.
 *
 * The payloads are written per archetype, from that archetype's own point of view,
 * so a match is stored twice — twelve bytes, against every reader having to flip it
 * themselves and one of them eventually getting it backwards.
 */
export const flip = (result) => (result === A_WON ? B_WON : result === B_WON ? A_WON : DRAW);
