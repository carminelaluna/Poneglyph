/**
 * The mark: a poneglyph — a standing stone with three carved rows of glyphs.
 * The topmost groove is lit with `--rune`, the red poneglyph that carries the
 * information worth keeping.
 */
export default function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg
      className="mark-glyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5 21V6.2C5 5.6 5.4 5 6.1 4.8L11.4 3.1a2 2 0 0 1 1.2 0l5.3 1.7c.7.2 1.1.8 1.1 1.4V21"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      <path d="M3.4 21h17.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8.3 9.4h7.4" stroke="var(--rune-lit)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8.3 13h7.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.45" />
      <path d="M8.3 16.6h4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}
