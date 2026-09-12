export const A_WON = 1;
export const B_WON = 0;
export const DRAW = 2;

const lower = (value) => String(value ?? '').toLowerCase();

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
    const result = winner === one ? A_WON : winner === two ? B_WON : DRAW;

    rows.push([a, b, result]);
  }

  return { rows, unknown, mirrors };
}

export const flip = (result) => (result === A_WON ? B_WON : result === B_WON ? A_WON : DRAW);
