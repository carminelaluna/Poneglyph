import type { MetadataRoute } from 'next';
import { cards, meta, sets } from '@/lib/cards';
import { archetypes, decks, hasDeckData } from '@/lib/decks';

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://poneglyph.gg';

/* Built once, like robots.txt — see the note there. */
export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date(meta.generatedAt);

  return [
    { url: BASE, lastModified: updated, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE}/cards`, lastModified: updated, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/sets`, lastModified: updated, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/decks`, lastModified: updated, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/data`, lastModified: updated, changeFrequency: 'daily', priority: 0.3 },
    { url: `${BASE}/legal`, lastModified: updated, changeFrequency: 'yearly', priority: 0.3 },
    /* Linked from the footer only, but they are the URLs given to OAuth providers,
       and a provider checking one should not find it absent from the sitemap. */
    { url: `${BASE}/privacy`, lastModified: updated, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: updated, changeFrequency: 'yearly', priority: 0.3 },
    ...sets.map((s) => ({
      url: `${BASE}/sets/${s.slug}`,
      lastModified: updated,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...(hasDeckData
      ? archetypes.map((a) => ({
          url: `${BASE}/decks/${a.slug}`,
          lastModified: updated,
          changeFrequency: 'daily' as const,
          priority: 0.8,
        }))
      : []),
    // Only the notable finishes are worth a crawl budget.
    ...(hasDeckData
      ? decks
          .filter((d) => d.placing !== null && d.placing <= 8)
          .slice(0, 500)
          .map((d) => ({
            url: `${BASE}/deck/${d.id}`,
            lastModified: updated,
            changeFrequency: 'monthly' as const,
            priority: 0.5,
          }))
      : []),
    ...cards.map((c) => ({
      url: `${BASE}/cards/${c.slug}`,
      lastModified: updated,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ];
}
