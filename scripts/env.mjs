/**
 * `.env.local` and `.env`, as Next would read them.
 *
 * Next loads these itself, so a build gets the variables either way — but three
 * scripts check a variable *before* handing over to Next, and plain Node does not
 * read the files. Without this, `build-static.mjs` refuses a correctly configured
 * checkout for a missing `NEXT_PUBLIC_CDN_URL` that is sitting in `.env.local`,
 * which is a confusing way to be told nothing is wrong.
 *
 * It lived in `build-static.mjs` and `deploy-site.mjs` as two byte-identical
 * copies, with a third partial one in `serve-static.mjs` that read a single
 * variable with the same quote-stripping and the same file order. Three copies of
 * "what counts as a set variable" is three chances for a deploy to disagree with
 * the build it is deploying.
 *
 * `parseEnv` is separated from the file reading for the reason the rest of this
 * directory separates them: a function that touches the filesystem cannot be run
 * by a test, and the parsing is the part with the decisions in it.
 */

import { existsSync, readFileSync } from 'node:fs';

/** The files Next reads, in the order it prefers them. */
export const ENV_FILES = ['.env.local', '.env'];

/**
 * `KEY=value` lines into a map.
 *
 * Blank lines, comments and anything that is not an assignment are skipped rather
 * than treated as an error: these files are edited by hand and a stray note in one
 * should not take a deploy down. Surrounding quotes come off, because `KEY="v"` and
 * `KEY=v` mean the same thing to everyone who writes one.
 */
export function parseEnv(text) {
  const found = new Map();
  for (const line of String(text ?? '').split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    /* First wins, matching `??=` below: an earlier file overrides a later one. */
    if (!found.has(match[1])) found.set(match[1], match[2].trim().replace(/^["']|["']$/g, ''));
  }
  return found;
}

/**
 * Load those files into `process.env`.
 *
 * A real environment variable always wins, so CI can set one without a file — that
 * is what `??=` is doing, and it is why this is safe to call at the top of a script
 * that also runs on a runner.
 */
export function loadEnvFiles(files = ENV_FILES) {
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const [key, value] of parseEnv(readFileSync(file, 'utf8'))) {
      process.env[key] ??= value;
    }
  }
}

/**
 * One variable, from the environment first and then the files.
 *
 * For a script that wants a single value and has no reason to pull the whole file
 * into its process — `serve-static.mjs` reading the base path is the case this
 * exists for.
 */
export function readEnv(name, fallback = '') {
  if (process.env[name]) return process.env[name];
  for (const file of ENV_FILES) {
    if (!existsSync(file)) continue;
    const found = parseEnv(readFileSync(file, 'utf8')).get(name);
    if (found !== undefined) return found;
  }
  return fallback;
}
