#!/usr/bin/env node
/**
 * Poneglyph — serve out/ the way GitHub Pages does.
 *
 *   node scripts/serve-static.mjs [--port 4322]
 *
 * `npm run start` runs the Next server, which resolves routes itself and will
 * happily render a page the static build never wrote. This does not: it looks for a
 * file, then for a directory index, and answers anything else with 404.html at
 * status 404 — which is exactly the behaviour the event, player and deck pages
 * depend on for every entity that is not prerendered.
 *
 * So this is the only local way to find out whether the deploy will actually work.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const args = process.argv.slice(2);
const at = args.indexOf('--port');
const PORT = Number(at === -1 ? process.env.PORT || 4322 : args[at + 1]);
const ROOT = path.resolve('out');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const isFile = (p) => existsSync(p) && statSync(p).isFile();

/** Where GitHub Pages would look, in order. */
function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const target = path.join(ROOT, path.normalize(clean).replace(/^(\.\.[/\\])+/, ''));
  if (isFile(target)) return { file: target, status: 200 };
  if (isFile(path.join(target, 'index.html'))) return { file: path.join(target, 'index.html'), status: 200 };
  if (isFile(`${target}.html`)) return { file: `${target}.html`, status: 200 };
  return { file: path.join(ROOT, '404.html'), status: 404 };
}

if (!existsSync(ROOT)) {
  console.error('[serve] no out/ — run `npm run build:static` first');
  process.exit(1);
}

createServer((req, res) => {
  const { file, status } = resolve(req.url ?? '/');
  if (!isFile(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('404');
  }
  res.writeHead(status, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`[serve] out/ on http://localhost:${PORT} — unmatched paths get 404.html, as on Pages`);
});
