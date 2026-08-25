#!/usr/bin/env node
/**
 * Source hygiene check.
 *
 * A literal control character inside a regex is invisible in an editor and in a
 * diff, matches nothing, and fails silently — a `\b` that became 0x08 made the
 * block-update list read as empty and quietly understated card legality. This has
 * happened more than once, so it is now checked rather than remembered.
 *
 *   node scripts/check-sources.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const SKIP = new Set(['node_modules', '.next', '.git', 'public']);
const EXTENSIONS = ['.mjs', '.js', '.ts', '.tsx', '.css', '.yml'];
/* Anything in C0 except tab, newline and carriage return. */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (EXTENSIONS.includes(path.extname(entry.name))) yield full;
  }
}

const findings = [];
for await (const file of walk(process.cwd())) {
  const text = await readFile(file, 'utf8');
  if (!CONTROL.test(text)) continue;
  text.split('\n').forEach((line, i) => {
    const m = line.match(CONTROL);
    if (!m) return;
    findings.push({
      file: path.relative(process.cwd(), file),
      line: i + 1,
      code: `0x${m[0].charCodeAt(0).toString(16).padStart(2, '0')}`,
      text: line.trim().slice(0, 90),
    });
  });
}

if (findings.length === 0) {
  console.log('[check] no stray control characters');
  process.exit(0);
}

console.error(`[check] ${findings.length} stray control character(s):`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  ${f.code}  ${f.text}`);
}
process.exit(1);
