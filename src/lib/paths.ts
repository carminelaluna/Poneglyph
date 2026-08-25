/**
 * Where the site lives.
 *
 * Next rewrites `<Link>` hrefs and bundled asset URLs for you when `basePath` is
 * set, but it does **not** touch `fetch()`. A project page on GitHub Pages is
 * served from `/<repo>/`, so a bare `fetch('/data/…')` asks the account root for a
 * file that is one directory down and gets the 404 page back — as JSON, which
 * fails to parse and reads like a corrupt payload rather than a wrong URL.
 *
 * Every fetch of something in `public/` goes through `dataUrl`.
 *
 * `NEXT_PUBLIC_BASE_PATH` is empty for a custom domain or a `<user>.github.io`
 * repo, and `/poneglyph` (say) for a project page. It is read at build time, like
 * every `NEXT_PUBLIC_` variable, so changing it means rebuilding.
 */
const RAW = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Normalised to either '' or '/something' — no trailing slash. */
export const BASE_PATH = RAW ? `/${RAW.replace(/^\/+|\/+$/g, '')}` : '';

/** URL of a file in public/, correct whether or not the site sits in a subpath. */
export const asset = (path: string) => `${BASE_PATH}/${path.replace(/^\/+/, '')}`;

/** URL of a JSON payload in public/data. */
export const dataUrl = (path: string) => asset(`data/${path.replace(/^\/+/, '')}`);
