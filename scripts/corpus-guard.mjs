export const KEEP_AT_LEAST = 0.5;

export function refusesWrite(found, held, keepAtLeast = KEEP_AT_LEAST) {
  if (!(held > 0)) return false;
  if (!(found > 0)) return true;
  return found < Math.floor(held * keepAtLeast);
}
