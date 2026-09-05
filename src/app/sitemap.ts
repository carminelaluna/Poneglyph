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
    /*
     * Five real pages that were missing from here for no reason other than having
     * been added after this list was written. /events and /banlist in particular
     * answer questions people type into a search engine rather than into the site.
     */
    { url: `${BASE}/events`, lastModified: updated, changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE}/tournaments`, lastModified: updated, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE}/players`, lastModified: updated, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE}/banlist`, lastModified: updated, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE}/spoilers`, lastModified: updated, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE}/deckbuilder`, lastModified: updated, changeFrequency: 'monthly', priority: 0.6 },
    /*
     * And a sixth, missed the same way the five above were: added after the list,
     * so the list did not know. That is twice now, which makes it the shape of this
     * file rather than an accident — a new top-level route needs a line here, and
     * nothing enforces it.
     */
    { url: `${BASE}/compare`, lastModified: updated, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE}/prices`, lastModified: updated, changeFrequency: 'daily', priority: 0.7 },
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
    /*
     * The two sub-pages of each archetype, at a lower priority than the page they
     * hang off. They are real pages with their own titles and their own answer —
     * every recorded matchup, every recorded list — rather than a paginated view of
     * one, which is the distinction worth spending 282 URLs on.
     */
    ...(hasDeckData
      ? archetypes.flatMap((a) =>
          ['matchups', 'decklists'].map((view) => ({
            url: `${BASE}/decks/${a.slug}/${view}`,
            lastModified: updated,
            changeFrequency: 'daily' as const,
            priority: 0.5,
          }))
        )
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
