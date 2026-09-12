import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://poneglyph.gg';

export const dynamic = 'force-static';

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
