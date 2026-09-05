/** The game's six colours, mapped to the pigment tokens defined in globals.css. */
export const PIGMENT: Record<string, string> = {
  Red: 'var(--c-red)',
  Green: 'var(--c-green)',
  Blue: 'var(--c-blue)',
  Purple: 'var(--c-purple)',
  Black: 'var(--c-black)',
  Yellow: 'var(--c-yellow)',
};

export const pigment = (color: string) => PIGMENT[color] ?? 'var(--glyph-faint)';
