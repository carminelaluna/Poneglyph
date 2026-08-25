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
const isExport = process.env.STATIC_EXPORT === '1';

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/^\/+|\/+$/g, '');

const nextConfig = {
  reactStrictMode: true,
  // Card art is served from upstream CDNs unless `npm run ingest:images` has
  // mirrored it into public/cards, so plain <img> is used throughout.
  images: { unoptimized: true },
  ...(isExport
    ? {
        output: 'export',
        /*
         * A project page lives at /<repo>/, a user page and a custom domain at the
         * root. Next rewrites its own links and assets for this; `fetch` it does not,
         * which is what src/lib/paths.ts is for.
         */
        ...(basePath ? { basePath: `/${basePath}` } : {}),
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
