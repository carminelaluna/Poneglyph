import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://poneglyph.gg';

/*
 * Written once at build time rather than answered per request. It has to be said
 * explicitly: Next treats a metadata route as dynamic by default, and `output:
 * 'export'` refuses to build one it cannot prove is static. Nothing here varies by
 * request, so this only tells Next what is already true.
 */
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // /art is a proxy, not content — keeping crawlers out of it avoids
      // thousands of upstream fetches on our behalf.
      { userAgent: '*', allow: '/', disallow: ['/art/'] },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
