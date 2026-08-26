#!/usr/bin/env node
/**
 * Source hygiene check.
 *
 * Two things that are invisible until they break something, both of which have
 * already cost a debugging session here:
 *
 * 1. A literal control character inside a regex. Invisible in an editor and in a
 *    diff, matches nothing, fails silently — a `\b` that became 0x08 made the
 *    block-update list read as empty and quietly understated card legality.
 *
 * 2. A PostgreSQL reserved word used as a bare column name. `placing integer` fails
 *    to parse, and the error points at the column name with no hint that the word
 *    itself is the problem.
 *
 *   node scripts/check-sources.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const SKIP = new Set(['node_modules', '.next', '.git', 'public']);
/*
 * .md is in here because CLAUDE.md is the file most likely to catch one: it
 * *documents* control characters, so writing that paragraph is itself a chance to
 * paste a real 0x00 into the repo. It did, and this check did not see it.
 */
const EXTENSIONS = ['.mjs', '.js', '.ts', '.tsx', '.css', '.yml', '.md'];
/* Anything in C0 except tab, newline and carriage return. */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

/**
 * PostgreSQL's *reserved* keywords — the ones that cannot name a column without
 * quotes. Non-reserved words like `role`, `format` and `name` are fine bare and are
 * deliberately not listed; flagging those would make this noise.
 */
const RESERVED = new Set(
  `all analyse analyze and any array as asc asymmetric both case cast check collate column
   constraint create current_catalog current_date current_role current_time current_timestamp
   current_user default deferrable desc distinct do else end except false fetch for foreign
   from grant group having in initially intersect into lateral leading limit localtime
   localtimestamp not null offset on only or order placing primary references returning select
   session_user some symmetric table then to trailing true union unique user using variadic
   when where window with`.split(/\s+/)
);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if ([...EXTENSIONS, '.sql'].includes(path.extname(entry.name))) yield full;
  }
}

const findings = [];

for await (const file of walk(process.cwd())) {
  const relative = path.relative(process.cwd(), file);
  const text = await readFile(file, 'utf8');

  if (CONTROL.test(text)) {
    text.split('\n').forEach((line, i) => {
      const m = line.match(CONTROL);
      if (!m) return;
      findings.push({
        file: relative,
        line: i + 1,
        why: `stray 0x${m[0].charCodeAt(0).toString(16).padStart(2, '0')}`,
        text: line.trim().slice(0, 80),
      });
    });
  }

  if (path.extname(file) === '.sql') {
    /* `  name  type` — a column definition, indented, inside a create table. */
    text.split('\n').forEach((line, i) => {
      const m = /^\s{2,}([a-z_]+)\s{2,}[a-z]/.exec(line);
      if (m && RESERVED.has(m[1])) {
        findings.push({
          file: relative,
          line: i + 1,
          why: `"${m[1]}" is a reserved word in PostgreSQL`,
          text: line.trim().slice(0, 80),
        });
      }
    });
  }
}

if (findings.length === 0) {
  console.log('[check] no stray control characters, no reserved column names');
  process.exit(0);
}

console.error(`[check] ${findings.length} problem(s):`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  ${f.why}\n      ${f.text}`);
}
process.exit(1);
