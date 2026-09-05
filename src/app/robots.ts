import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://poneglyph.gg';

/*
 * Written once at build time rather than answered per request. It has to be said
 * explicitly: Next treats a metadata route as dynamic by default, and `output:
 * 'export'` refuses to build one it cannot prove is static. Nothing here varies by
 * request, so this only tells Next what is already true.
 *
 * The `Content-Signal` header block is *not* here, because `MetadataRoute.Robots`
 * has no field for a directive it does not know. `build-static.mjs` prepends it to
 * the exported file — see `writeRobotsSignals` there, and note the consequence:
 * only the static export carries the signals, which is the only build deployed.
 */
export const dynamic = 'force-static';

/**
 * Crawlers that collect for training rather than for search.
 *
 * This is the half that anything actually obeys today — `Content-Signal` states the
 * intent, a `Disallow` is what a well-behaved crawler reads. The list is the one
 * publishers have converged on, and it is deliberately **not** the search crawlers:
 * Googlebot and Bingbot are welcome, because being findable is the whole point of a
 * public archive.
 *
 * `ClaudeBot` is on it for consistency rather than for enthusiasm. Blocking every
 * other trainer while leaving one out would be a policy with an exception in it and
 * no reason for the exception.
 *
 * This is also the same request this project honours when it is on the other side:
 * onepiece.gg names AI crawlers in its robots.txt, so nothing here ever fetches it.
 */
const TRAINING_CRAWLERS = [
  'Amazonbot',
  'Applebot-Extended',
  'Bytespider',
  'CCBot',
  'ClaudeBot',
  'Google-Extended',
  'GPTBot',
  'meta-externalagent',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // /art is a proxy, not content — keeping crawlers out of it avoids
      // thousands of upstream fetches on our behalf.
      //
      // /account, /submit and /review render nothing without a session: a crawler
      // gets the signed-out shell, which is one page of text repeated under three
      // URLs and is not what anyone is searching for.
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/art/', '/account/', '/submit/', '/review/'],
      },
      ...TRAINING_CRAWLERS.map((userAgent) => ({ userAgent, disallow: '/' })),
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
