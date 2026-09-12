import { Fragment } from 'react';

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
