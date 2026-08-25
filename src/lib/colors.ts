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

/**
 * A card's glow colour. Multicolour cards get a hard-edged split so a Red/Green
 * leader reads as both, never as a muddy blend.
 */
export function pigmentGlow(colors: string[]) {
  if (colors.length === 0) return 'var(--glyph-faint)';
  if (colors.length === 1) return pigment(colors[0]);
  const step = 100 / colors.length;
  const stops = colors
    .map((c, i) => `${pigment(c)} ${i * step}% ${(i + 1) * step}%`)
    .join(', ');
  return `linear-gradient(120deg, ${stops})`;
}
