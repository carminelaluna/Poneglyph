import { existsSync, readFileSync } from 'node:fs';

export const ENV_FILES = ['.env.local', '.env'];

export function parseEnv(text) {
  const found = new Map();
  for (const line of String(text ?? '').split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    if (!found.has(match[1])) found.set(match[1], match[2].trim().replace(/^["']|["']$/g, ''));
  }
  return found;
}

export function loadEnvFiles(files = ENV_FILES) {
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const [key, value] of parseEnv(readFileSync(file, 'utf8'))) {
      process.env[key] ??= value;
    }
  }
}

export function readEnv(name, fallback = '') {
  if (process.env[name]) return process.env[name];
  for (const file of ENV_FILES) {
    if (!existsSync(file)) continue;
    const found = parseEnv(readFileSync(file, 'utf8')).get(name);
    if (found !== undefined) return found;
  }
  return fallback;
}
