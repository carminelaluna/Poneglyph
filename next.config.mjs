/**
 * Two builds from one source.
 *
 * `npm run dev` and `npm run build` give the app as it has always been: server
 * rendered, with `/art/[id]` mirroring card images on first request so a fresh
 * checkout works with no CDN configured.
 *
 * `npm run build:static` sets STATIC_EXPORT and produces `out/` — plain files for
 * GitHub Pages. That build has no server, so the art proxy cannot exist in it and
 * scripts/build-static.mjs takes the route out before calling Next. Images come
 * from NEXT_PUBLIC_CDN_URL there, which is why that variable is required for it.
 *
 * @type {import('next').NextConfig}
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const isExport = process.env.STATIC_EXPORT === '1';

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/^\/+|\/+$/g, '');

/**
 * A build id that only changes when the site does.
 *
 * Next generates a random one per build and writes it into every page and every RSC
 * payload — 4,735 files. Two builds of identical data therefore differed in 23,667
 * of 24,196 files, which for a branch-based deploy meant force-pushing 466 MB of new
 * git objects twice a day. The repository would have passed a gigabyte in two days.
 *
 * Hashing `data/` instead makes the id a function of the content the pages are built
 * from: unchanged data, byte-identical output, and a deploy that carries only what
 * actually moved. Code changes are still safe — chunk filenames are content-hashed,
 * so changed code lands under a new name regardless of this.
 */
function buildIdFromData() {
  const dir = path.resolve('data');
  const hash = createHash('sha256');
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    hash.update(name);
    hash.update(readFileSync(path.join(dir, name)));
  }
  return hash.digest('base64url').slice(0, 21);
}

const nextConfig = {
  reactStrictMode: true,
  // Card art is served from upstream CDNs unless `npm run ingest:images` has
  // mirrored it into public/cards, so plain <img> is used throughout.
  images: { unoptimized: true },
  /*
   * A project page lives at /<repo>/, a user page and a custom domain at the root.
   * Next rewrites its own links and assets for this; `fetch` it does not, which is
   * what src/lib/paths.ts is for.
   *
   * This applies to **every** build, and it used to apply only to the export. The
   * variable it reads is NEXT_PUBLIC_, so `dataUrl()` prefixed every payload URL
   * with /Poneglyph in `npm run dev` while the dev server went on answering at the
   * root — every fetch on the card browser, the deck builder and the metagame page
   * 404ed locally, and the pages said the archive had failed to load. Serving dev
   * from the same path production uses is the fix, and it is the same reasoning as
   * `serve:static` mounting `out/` under the base path rather than at the root.
   */
  ...(basePath ? { basePath: `/${basePath}` } : {}),
  ...(isExport
    ? {
        output: 'export',
        generateBuildId: buildIdFromData,
        /*
         * Emit /event/abc/index.html rather than /event/abc.html. Static hosts serve
         * a directory index without being asked; whether they also try adding .html
         * varies, and this does not depend on that.
         */
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
