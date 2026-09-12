#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { loadEnvFiles } from './env.mjs';

const OUT = path.resolve('out');

loadEnvFiles();

const log = (...m) => console.log('[deploy]', ...m);

function git(args, allowFail = false) {
  const result = spawnSync('git', args, { cwd: OUT, stdio: 'inherit' });
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

  if (/^prod$|^dev$|^main-node$|^main$|^master$/.test(branch)) {
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

  await rm(path.join(OUT, '.git'), { recursive: true, force: true });

  const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  git(['init', '--quiet', '--initial-branch', branch]);

  git(['config', 'core.autocrlf', 'false']);
  git(['config', 'core.safecrlf', 'false']);

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
