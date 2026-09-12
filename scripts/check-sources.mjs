#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const SKIP = new Set(['node_modules', '.next', '.git', 'public']);
const EXTENSIONS = ['.mjs', '.js', '.ts', '.tsx', '.css', '.yml', '.md'];
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

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

function* selfReferencingPolicies(text) {
  const statements = text.split(/;\s*\n/);
  let consumed = 0;

  for (const statement of statements) {
    const at = consumed;
    consumed += statement.length + 1;

    const head = /create\s+policy\s+"([^"]+)"\s+on\s+(public\.[a-z_]+)/i.exec(statement);
    if (!head) continue;

    const [, name, table] = head;
    if (!new RegExp(`from\\s+${table.replace('.', '\\.')}\\b`, 'i').test(statement)) continue;

    yield {
      name: `create policy "${name}"`,
      table,
      line: text.slice(0, at).split('\n').length,
    };
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

    for (const policy of selfReferencingPolicies(text)) {
      findings.push({
        file: relative,
        line: policy.line,
        why:
          `policy on ${policy.table} reads ${policy.table} — infinite recursion; ` +
          'ask through a security definer function',
        text: policy.name,
      });
    }
  }
}

if (findings.length === 0) {
  console.log('[check] no stray control characters, no reserved column names, no recursive policies');
  process.exit(0);
}

console.error(`[check] ${findings.length} problem(s):`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  ${f.why}\n      ${f.text}`);
}
process.exit(1);
