export const SOURCES = {
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

  vegapullRecords: {
    id: 'vegapull-records',
    label: 'Vegapull Records (Coko7)',
    home: 'https://github.com/Coko7/vegapull-records',
    packUrl: (packId, lang = 'english') =>
      `https://raw.githubusercontent.com/Coko7/vegapull-records/main/data/${lang}/cards_${packId}.json`,
  },

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
    pairingsUrl: (id) => `https://play.limitlesstcg.com/api/tournaments/${id}/pairings`,
    detailsUrl: (id) => `https://play.limitlesstcg.com/api/tournaments/${id}/details`,
    tournamentPage: (id) => `https://play.limitlesstcg.com/tournament/${id}`,
  },

  gumgum: {
    id: 'gumgum',
    label: 'gumgum.gg',
    home: 'https://gumgum.gg/',
    deckUrl: (id) => `https://gumgum.gg/api/debug-decklist?id=${id}`,
    enumerable: false,
  },

  topdecks: {
    id: 'topdecks',
    label: 'One Piece Top Decks',
    home: 'https://onepiecetopdecks.com/',
    postsUrl: (page, perPage = 50) =>
      `https://onepiecetopdecks.com/wp-json/wp/v2/posts?page=${page}&per_page=${perPage}`,
    structured: false,
  },

  topdecks: {
    id: 'topdecks',
    label: 'One Piece Top Decks',
    home: 'https://onepiecetopdecks.com',
    indexUrl: 'https://onepiecetopdecks.com/deck-list/',
  },

  onepieceGg: {
    id: 'onepiece-gg',
    label: 'onepiece.gg',
    home: 'https://onepiece.gg/decks/',
    excluded: true,
    reason: 'robots.txt disallows automated agents by name; deck pages return 403',
  },
};

export const RULES_SOURCES = {
  bandai: {
    id: 'bandai-rules',
    label: 'ONE PIECE CARD GAME — official site',
    home: 'https://en.onepiece-cardgame.com/',
    restrictionUrl: 'https://en.onepiece-cardgame.com/rules/restriction/',
    errataUrl: 'https://en.onepiece-cardgame.com/rules/errata_card/',
    blockUpdateUrl: 'https://en.onepiece-cardgame.com/rules/blockicon-card/',
    eventsUrl: 'https://en.onepiece-cardgame.com/events/',
  },
};

export const SPOILER_SOURCES = {
  topdecks: {
    id: 'topdecks-leaks',
    label: 'One Piece Top Decks',
    home: 'https://onepiecetopdecks.com/',
    leaksCategory: 169,
    leaksCategoryName: 'Card Leaks',
    leakCategories: [
      [169, 'Card Leaks'],
      [1, 'Uncategorized'],
    ],
    postsUrl: (category, perPage = 40) =>
      `https://onepiecetopdecks.com/wp-json/wp/v2/posts?categories=${category}&per_page=${perPage}&_fields=id,date,link,title,content`,
  },
};
