/**
 * Poneglyph — data sources.
 *
 * Every source is public and read-only. The ingest merges them with an explicit
 * priority so a single source going down degrades the dataset instead of breaking it.
 */

export const SOURCES = {
  /**
   * PRIMARY — punk-records: static, versioned JSON dataset built from the official
   * Bandai card list by the `vegapull` scraper. Fresh, typed, includes every printing
   * (parallels / alternate arts) as its own id.
   */
  punkRecords: {
    id: 'punk-records',
    label: 'Punk Records (buhbbl)',
    home: 'https://github.com/buhbbl/punk-records',
    license: 'Data derived from the official One Piece Card Game site',
    cardsByIdUrl: (lang = 'english') =>
      `https://raw.githubusercontent.com/buhbbl/punk-records/main/${lang}/index/cards_by_id.json`,
    packsUrl: (lang = 'english') =>
      `https://raw.githubusercontent.com/buhbbl/punk-records/main/${lang}/packs.json`,
    manifestUrl: (lang = 'english') =>
      `https://raw.githubusercontent.com/buhbbl/punk-records/main/${lang}/manifest.json`,
    cardUrl: (packId, cardId, lang = 'english') =>
      `https://raw.githubusercontent.com/buhbbl/punk-records/main/${lang}/cards/${packId}/${cardId}.json`,
  },

  /**
   * SECONDARY — vegapull-records: per-pack dumps from the same scraper. Carries the
   * `effect` / `trigger` text in bulk (37 requests instead of one per card), but lags
   * a few sets behind, so it is used as a bulk pre-fill only.
   */
  vegapullRecords: {
    id: 'vegapull-records',
    label: 'Vegapull Records (Coko7)',
    home: 'https://github.com/Coko7/vegapull-records',
    packUrl: (packId, lang = 'english') =>
      `https://raw.githubusercontent.com/Coko7/vegapull-records/main/data/${lang}/cards_${packId}.json`,
  },

  /**
   * ENRICHMENT — OPTCG API: community REST API with human set names and TCGplayer
   * market prices. No key, GET only. Never the spine: its promo rows have shifted
   * columns, so only whitelisted fields are read from it.
   */
  optcgApi: {
    id: 'optcgapi',
    label: 'OPTCG API',
    home: 'https://optcgapi.com/',
    docs: 'https://optcgapi.com/documentation',
    endpoints: {
      sets: 'https://optcgapi.com/api/allSets/',
      setCards: 'https://optcgapi.com/api/allSetCards/',
      starterCards: 'https://optcgapi.com/api/allSTCards/',
      promoCards: 'https://optcgapi.com/api/allPromos/',
    },
    imageUrl: (imageId) => `https://optcgapi.com/media/static/Card_Images/${imageId}.jpg`,
  },
};

/**
 * DECKLISTS — Limitless. A documented, public REST API that returns tournament
 * standings with fully structured decklists: every card as {count, name, set,
 * number}, which maps straight onto our card ids. No API key, and the site's
 * robots.txt permits crawling.
 *
 * The rate limit is advertised in the response headers as 50 requests per 5
 * minutes, so the deck ingest is incremental and resumable by design.
 */
export const DECK_SOURCES = {
  limitless: {
    id: 'limitless',
    label: 'Limitless TCG',
    home: 'https://onepiece.limitlesstcg.com/',
    docs: 'https://docs.limitlesstcg.com/developer.html',
    base: 'https://play.limitlesstcg.com/api',
    game: 'OP',
    rateLimit: { requests: 50, windowMs: 5 * 60 * 1000 },
    tournamentsUrl: (page, limit = 50) =>
      `https://play.limitlesstcg.com/api/tournaments?game=OP&limit=${limit}&page=${page}`,
    standingsUrl: (id) => `https://play.limitlesstcg.com/api/tournaments/${id}/standings`,
    /*
     * Round, table, both players and the winner, by username — which is what makes
     * a real Leader-against-Leader record possible rather than a reconstruction
     * from standings. One request per tournament; see ingest-matchups.mjs.
     */
    pairingsUrl: (id) => `https://play.limitlesstcg.com/api/tournaments/${id}/pairings`,
    detailsUrl: (id) => `https://play.limitlesstcg.com/api/tournaments/${id}/details`,
    tournamentPage: (id) => `https://play.limitlesstcg.com/tournament/${id}`,
  },

  /**
   * gumgum.gg exposes one working JSON route, /api/debug-decklist?id=<uuid>, which
   * returns a deck as "4xOP11-030;4xOP11-100;..." plus placement and source. There
   * is no listing endpoint (/api/decklists is 403), so decks cannot be enumerated —
   * it only works when you already have a deck id. That makes it an import-by-URL
   * source, not a crawl source.
   */
  gumgum: {
    id: 'gumgum',
    label: 'gumgum.gg',
    home: 'https://gumgum.gg/',
    deckUrl: (id) => `https://gumgum.gg/api/debug-decklist?id=${id}`,
    enumerable: false,
  },

  /**
   * onepiecetopdecks.com runs WordPress with the REST API open. Its decklists live
   * inside article prose rather than structured fields, so it is a source of meta
   * commentary and attribution links, not of machine-readable decks.
   */
  topdecks: {
    id: 'topdecks',
    label: 'One Piece Top Decks',
    home: 'https://onepiecetopdecks.com/',
    postsUrl: (page, perPage = 50) =>
      `https://onepiecetopdecks.com/wp-json/wp/v2/posts?page=${page}&per_page=${perPage}`,
    structured: false,
  },

  /**
   * Historical decklists for both Japan and English. Limitless starts in 2026 and is
   * a Western scene — one Japanese player in 8,500 — so Top Decks covers both gaps.
   * Its per-set deck-list pages run back to OP-01 and each deck is a link carrying
   * its full contents in the query string, which makes them structured data despite
   * being HTML.
   */
  topdecks: {
    id: 'topdecks',
    label: 'One Piece Top Decks',
    home: 'https://onepiecetopdecks.com',
    /* The index page is the authoritative list: a WordPress search for "deck list"
       misses the twelve older pages, which use different URL prefixes. */
    indexUrl: 'https://onepiecetopdecks.com/deck-list/',
  },

  /**
   * onepiece.gg is deliberately NOT integrated. Its robots.txt disallows automated
   * agents by name (anthropic-ai, Claude-Web, GPTBot, ChatGPT-User) and the deck
   * pages answer 403 to non-browser clients. That is an explicit opt-out, so the
   * project does not fetch from it. Link to it, do not crawl it.
   */
  onepieceGg: {
    id: 'onepiece-gg',
    label: 'onepiece.gg',
    home: 'https://onepiece.gg/decks/',
    excluded: true,
    reason: 'robots.txt disallows automated agents by name; deck pages return 403',
  },
};

/**
 * RULES — the banned and restricted list.
 *
 * This one comes from Bandai directly and from nowhere else. A community mirror
 * would be a second-hand copy of something whose entire value is being the
 * authority, and a stale banlist is worse than none.
 *
 * There is no API; the page is HTML. It is regular enough to parse, and the ingest
 * refuses to write an empty result rather than silently clearing the list if the
 * layout changes.
 */
export const RULES_SOURCES = {
  bandai: {
    id: 'bandai-rules',
    label: 'ONE PIECE CARD GAME — official site',
    home: 'https://en.onepiece-cardgame.com/',
    restrictionUrl: 'https://en.onepiece-cardgame.com/rules/restriction/',
    errataUrl: 'https://en.onepiece-cardgame.com/rules/errata_card/',
    /*
     * The rotation has a published exception. Super Parallel Rares from past
     * products, and cards sharing those card numbers, keep their Standard legality
     * even when their block has rotated out — Bandai lists exactly which numbers.
     * Without this, ~53 legal cards read as Extra-only.
     */
    blockUpdateUrl: 'https://en.onepiece-cardgame.com/rules/blockicon-card/',
    /*
     * Official events — Regionals, Finals, Treasure Cups and the rest, each with a
     * date, a venue and a registration link.
     *
     * The index is read rather than a list of pages being kept here: Bandai adds a
     * page per season and per event series, and the URLs change. Following the index
     * means a new series appears on its own.
     *
     * These pages looked client-rendered and were written off twice. They are not —
     * the events are in the served HTML, further down than a first glance reaches.
     */
    eventsUrl: 'https://en.onepiece-cardgame.com/events/',
  },
};

/**
 * SPOILERS — coverage of sets that have not shipped yet.
 *
 * The official card list only publishes on release, so unreleased cards can only
 * come from community coverage. One Piece Top Decks runs a "Card Leaks" category
 * and, usefully, uploads each scan under its own card number
 * (`/wp-content/uploads/2026/08/OP18-021.jpg`), which makes the coverage
 * machine-readable rather than just prose. Their robots.txt permits crawling.
 */
export const SPOILER_SOURCES = {
  topdecks: {
    id: 'topdecks-leaks',
    label: 'One Piece Top Decks',
    home: 'https://onepiecetopdecks.com/',
    leaksCategory: 169,
    leaksCategoryName: 'Card Leaks',
    postsUrl: (category, perPage = 40) =>
      `https://onepiecetopdecks.com/wp-json/wp/v2/posts?categories=${category}&per_page=${perPage}&_fields=id,date,link,title,content`,
  },
};

/** Languages punk-records publishes. Only `english` is wired into the site today. */
export const LANGUAGES = [
  'english',
  'english-asia',
  'japanese',
  'chinese-hongkong',
  'korean',
  'thai',
];
