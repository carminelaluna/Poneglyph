#!/usr/bin/env node
/**
 * Poneglyph — publish out/ to the site repository.
 *
 *   npm run deploy:site
 *
 * One repository, two branches, one source.
 *
 *   main-node       the code, the ingests and the data — where changes are made
 *   main-selfhost   nothing but the built site, which is what GitHub Pages serves
 *
 * The site branch is an orphan: it shares no history with main-node, and it is
 * rebuilt from scratch on every deploy — a fresh `git init`, one commit, a force
 * push. It keeps no history, deliberately. It is 28,000 generated files that change
 * twice a day, and a history of that is unreadable and grows without bound, while
 * the history that matters — of the source and the data the site was built from — is
 * on main-node. Rolling back means checking out an older commit there and building
 * again.
 *
 * Because it is a force push onto a branch that holds only generated output, it can
 * never lose work: there is nothing on it that did not come out of a build.
 *
 * Set the destination once, in .env.local:
 *
 *   PONEGLYPH_SITE_REMOTE=https://github.com/<user>/<repo>.git
 *   PONEGLYPH_SITE_BRANCH=main-selfhost
 *
 * GitHub Pages has to be pointed at that branch in the repository's settings, which
 * is not something this script can do.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('out');

function loadEnvFiles() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      process.env[match[1]] ??= match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

loadEnvFiles();

const log = (...m) => console.log('[deploy]', ...m);

function git(args, allowFail = false) {
  const result = spawnSync('git', args, {
    cwd: OUT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0 && !allowFail) {
    console.error(`[deploy] git ${args[0]} failed`);
    process.exit(result.status ?? 1);
  }
  return result.status;
}

async function main() {
  const remote = process.env.PONEGLYPH_SITE_REMOTE;
  const branch = process.env.PONEGLYPH_SITE_BRANCH || 'main';

  if (!remote) {
    console.error(
      '[deploy] PONEGLYPH_SITE_REMOTE is not set. Put it in .env.local:\n' +
        '           PONEGLYPH_SITE_REMOTE=https://github.com/<user>/<repo>.git\n' +
        '           PONEGLYPH_SITE_BRANCH=main-selfhost'
    );
    process.exit(1);
  }

  /*
   * Refuse to overwrite the source. The branch this pushes to is replaced wholesale
   * by generated output, and aiming that at main-node would delete the project.
   */
  if (/^main-node$|^main$|^master$/.test(branch)) {
    console.error(
      `[deploy] PONEGLYPH_SITE_BRANCH is "${branch}", which is a source branch.\n` +
        '         This force-pushes generated output and would erase it. Use main-selfhost.'
    );
    process.exit(1);
  }

  if (!existsSync(path.join(OUT, 'index.html'))) {
    console.error('[deploy] out/ has no index.html — run `npm run build:static` first');
    process.exit(1);
  }

  if (!existsSync(path.join(OUT, '.nojekyll'))) {
    console.error(
      '[deploy] out/.nojekyll is missing. Without it GitHub Pages runs Jekyll, which\n' +
        '         skips _next/ and serves an unstyled, inert site. Rebuild with\n' +
        '         `npm run build:static` rather than deploying this.'
    );
    process.exit(1);
  }

  /* No history to preserve, so start clean rather than reconcile with the remote. */
  await rm(path.join(OUT, '.git'), { recursive: true, force: true });

  const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  git(['init', '--quiet', '--initial-branch', branch]);
  git(['add', '--all']);
  git(['-c', 'user.name=poneglyph', '-c', 'user.email=deploy@poneglyph.local',
       'commit', '--quiet', '--message', `Site build ${stamp}`]);
  git(['remote', 'add', 'origin', remote]);

  log(`pushing to ${remote} (${branch}) — this replaces whatever is there`);
  git(['push', '--force', 'origin', branch]);

  log('published. GitHub Pages usually reflects it within a minute.');
}

main().catch((err) => {
  console.error('[deploy] FAILED —', err.message);
  process.exit(1);
});
