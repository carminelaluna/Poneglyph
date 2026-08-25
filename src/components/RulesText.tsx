import { Fragment } from 'react';

/**
 * Rules text arrives in the official site's own notation:
 *
 *   [On Play]           a timing or keyword
 *   {Straw Hat Crew}    a trait reference
 *   <Slash>             an attribute reference
 *   <br>                a line break between separate abilities
 *
 * Each is given its own treatment so a long ability can be scanned rather than
 * read. The text is tokenised, never injected as HTML.
 */

const TOKEN = /(\[[^\]]+\]|\{[^}]+\}|<[A-Za-z][^>]*>)/g;

export default function RulesText({ text, className }: { text: string | null; className?: string }) {
  if (!text) return <span className="muted">No rules text.</span>;

  const lines = text.split(/<br\s*\/?>/i).map((line) => line.trim()).filter(Boolean);

  return (
    <div className={className}>
      {lines.map((line, i) => (
        <p key={i} className="rules-line">
          {tokenise(line)}
        </p>
      ))}
    </div>
  );
}

function tokenise(line: string) {
  return line.split(TOKEN).map((part, i) => {
    if (!part) return null;

    if (part.startsWith('[') && part.endsWith(']')) {
      return (
        <b key={i} className="rules-keyword">
          {part.slice(1, -1)}
        </b>
      );
    }
    if (part.startsWith('{') && part.endsWith('}')) {
      return (
        <span key={i} className="rules-trait">
          {part.slice(1, -1)}
        </span>
      );
    }
    if (part.startsWith('<') && part.endsWith('>')) {
      return (
        <span key={i} className="rules-attribute">
          {part.slice(1, -1)}
        </span>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
