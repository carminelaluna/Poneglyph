/**
 * Poneglyph — reading card reveals out of Discord messages.
 *
 * Pure and free of imports, so a test can run it without a bot token, which is the
 * whole reason it is a file of its own: everything else about this source needs
 * credentials and a server, and none of that can be exercised in CI.
 *
 * Why Discord at all. The web source we had publishes a leak article and then
 * leaves it alone — both of its current articles were last *modified* twelve days
 * before anybody noticed the page was stale. Reveals reach a community channel
 * within minutes and keep coming, one card at a time, which is the shape this
 * archive actually wants.
 *
 * What a message looks like, and why both halves are read:
 *
 * - **Attachment filenames** are the reliable half when somebody uploads a scan
 *   named for its card, `OP18-021.png`. That is how the web source names them too.
 * - **Message text** is the other half, because most posts are a photo of a card
 *   with the number typed beside it, and the photo is named `IMG_4821.jpg`.
 *
 * Neither is trustworthy alone and both are cheap, so both are read and the ids
 * are merged.
 */

/**
 * A card number as this game writes it: two to four letters, an optional set
 * number, a dash, exactly three digits.
 *
 * The trailing guard is the same one `cardsFromHtml` needs in the spoilers ingest,
 * for the same reason: WordPress and phone cameras both produce `name-1024x768`,
 * and without it `prb22-1024x461.jpeg` reads as set `PRB22` card `102` — a set
 * that does not exist holding a card that does not exist.
 */
const CARD_ID = /\b([A-Z]{1,4}\d{0,2})-(\d{3})(?![\dx])/gi;

/** `OP18-021`, uppercased, from any string. */
export function cardIds(text) {
  const out = new Set();
  for (const m of String(text ?? '').matchAll(CARD_ID)) {
    out.add(`${m[1].toUpperCase()}-${m[2]}`);
  }
  return out;
}

/**
 * The set a card id belongs to. `OP18-021` -> `OP18`, `P-122` -> `P`.
 *
 * Promos carry no set number, which is why the pattern above allows zero digits
 * there — three of the archetypes in the deck corpus are promo Leaders.
 */
export const setOf = (id) => id.split('-')[0];

/**
 * The parts of a message that can carry a reveal, flattened.
 *
 * A **forwarded** message is empty at the top level: `content`, `attachments` and
 * `embeds` are all blank, and the real thing sits in `message_snapshots[].message`,
 * which is an immutable copy taken when the forward was made. That is not an edge
 * case here — it is how the whole channel is fed, and reading only the top level
 * saw twelve posts and found nothing in any of them, which looked exactly like a
 * missing Message Content intent and cost two runs to tell apart.
 *
 * Discord limits snapshot nesting to one level, so one pass is all of it.
 */
function partsOf(message) {
  const parts = [message];
  for (const snapshot of message?.message_snapshots ?? []) {
    if (snapshot?.message) parts.push(snapshot.message);
  }
  return parts;
}

/**
 * Everything a message says, forwarded content included, as one string.
 *
 * Exported because the ingest asks the same question to tell a channel that is
 * quiet from one whose content it cannot see.
 */
export const textOf = (message) =>
  partsOf(message)
    .map((p) => p?.content ?? '')
    .filter(Boolean)
    .join(' ');

/** Every attachment on a message, forwarded ones included. */
export const filesOf = (message) =>
  partsOf(message).flatMap((p) => p?.attachments ?? []);

/**
 * One Discord message -> the cards it reveals.
 *
 * `content` is the typed text, `attachments` the uploaded files, and both are
 * read through `partsOf` so a forward is read like anything else. A crossposted
 * message — one that arrived by following an announcement channel — has the same
 * shape with a `webhook_id` set, so nothing here needs to know which it is.
 *
 * All of it comes back empty unless the app has the MESSAGE_CONTENT privileged
 * intent, which is a checkbox for a bot this size but is not optional: without it
 * this function is handed nothing and correctly finds nothing.
 */
export function cardsFromMessage(message) {
  const found = new Map();

  const note = (id, image) => {
    const held = found.get(id);
    /* First image wins, but an id seen first in text still takes a later file. */
    if (!held) found.set(id, { id, image: image ?? null, name: null, text: null });
    else if (!held.image && image) held.image = image;
  };

  for (const id of cardIds(textOf(message))) note(id, null);

  for (const attachment of filesOf(message)) {
    const name = attachment?.filename ?? '';
    const ids = [...cardIds(name)];
    /*
     * A file named for its card is evidence about that card. A file named
     * `IMG_4821.jpg` beside a message naming one card is evidence about that one
     * too — but beside a message naming six, it is not evidence about any of
     * them, so it is left unattached rather than guessed at.
     */
    if (ids.length > 0) {
      for (const id of ids) note(id, attachment.url ?? null);
    }
  }

  const named = [...cardIds(textOf(message))];
  const loose = filesOf(message).filter((a) => cardIds(a?.filename ?? '').size === 0);
  if (named.length === 1 && loose.length === 1) {
    const entry = found.get(named[0]);
    if (entry && !entry.image) entry.image = loose[0].url ?? null;
  }

  /*
   * The typed text, kept for the one card it can be about.
   *
   * These posts carry a translation when the reveal is not English — a Japanese
   * card arrives as a photo plus somebody typing out what it does — and that is
   * the only thing on the page that says what an unreleased card does at all.
   *
   * Same rule as the image, and for the same reason: a message naming one card is
   * about that card, and a message naming six is about six. Attaching the text to
   * whichever was named first would put one card's rules under another's number,
   * which is worse than saying nothing.
   */
  if (named.length === 1) {
    const entry = found.get(named[0]);
    const said = describe(textOf(message), named[0]);
    if (entry) {
      entry.name = said.name;
      entry.text = said.text;
    }
  }

  return [...found.values()];
}

/** The longest a reveal's text can be before it is somebody talking, not a card. */
const MOST_TEXT = 600;

/**
 * The six colours this game has, which is what makes the rest parseable.
 *
 * A reveal is posted as `Name Colour Type Rarity`, so the colour is the hinge: what
 * comes before it is the card's name and what follows is what is known about it.
 */
const COLOURS = ['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'];

/**
 * Discord's own markup, out.
 *
 * These posts arrive wrapped in a code fence with a role ping on the end —
 * ```` ``` Monet Red Character C ``` <@&1370648885474889869> ```` — and none of
 * that is about the card. Mentions especially: an id printed on a public page is
 * somebody's role or account, and it is noise to every reader.
 */
export function cleanMarkup(text) {
  return String(text ?? '')
    .replace(/```+/g, ' ')
    .replace(/<a?:\w+:\d+>/g, ' ')
    /* `<@123>`, `<@!123>`, `<@&123>`, `<#123>` — a mention Discord sent raw. */
    .replace(/<[@#][&!]?\d+>/g, ' ')
    /*
     * And the same mention already resolved to its name: `@Card Reveals`, which
     * is what arrives when the poster typed it or when a forward carries the
     * snapshot's rendered text. Two of the stored reveals ended with the channel's
     * own role ping sitting in the card's description.
     *
     * `@` plus a word, plus any capitalised words after it, because a role name
     * has spaces in it. Safe here in a way it would not be generally: card text in
     * this game contains no `@` at all.
     */
    .replace(/@\w[\w'’-]*(?:\s+[A-Z][\w'’-]*)*/g, ' ')
    .replace(/[*_~`|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What a reveal says about its card: a name, and whatever else was typed.
 *
 * The name is what sits before the colour, and it is worth pulling out on its own
 * because the page has been printing "Name not listed" under every one of these.
 * Everything from the colour on — `Red Character C`, sometimes a cost, a power
 * and an ability — stays as the description.
 *
 * A colour at the very start leaves no name, which is what a card actually called
 * something like "Red-Haired" would do; the whole line stays a description rather
 * than the page inventing a blank name.
 */
export function describe(text, id) {
  const said = cleanMarkup(text)
    /* The number itself: the page prints it beside the description anyway. */
    .replace(new RegExp(id, 'gi'), ' ')
    .replace(/\s+/g, ' ')
    /* Punctuation left behind where the number was: a dash, a colon, a pipe. */
    .replace(/^[\s\p{Pd}:|]+/u, '')
    .trim();

  if (!said || said.length > MOST_TEXT) return { name: null, text: null };

  /*
   * Concatenation, not a template literal. In a template literal `\b` is the
   * backspace character rather than a word boundary, so the regex compiles and
   * matches nothing — the exact trap CLAUDE.md records, and this is the fourth
   * time it has been walked into here. `npm run check` cannot catch this one:
   * the file holds a backslash and a b, and only the runtime turns them into
   * a control character.
   */
  const at = said.search(new RegExp('\\b(?:' + COLOURS.join('|') + ')\\b'));
  const name = at > 0 ? said.slice(0, at).trim() : null;
  const rest = at > 0 ? said.slice(at).trim() : said;

  return {
    name: name && name.length >= 2 ? name : null,
    /* A couple of characters left over is not a description of anything. */
    text: rest.length >= 8 ? rest : null,
  };
}


/**
 * A batch of messages -> what is revealed, by set, newest first.
 *
 * `released` is the set prefixes already in the card archive. A channel talks
 * about released cards constantly — deck advice, price chat, a reprint — so
 * without this filter the spoilers page would fill up with sets that shipped
 * years ago. It is the same test the web ingest applies.
 */
export function revealsFromMessages(messages, released = new Set()) {
  const sets = new Map();

  /* Oldest first, so the earliest sighting is the one whose timestamp is kept. */
  const ordered = [...messages].sort((a, b) =>
    String(a?.timestamp ?? '').localeCompare(String(b?.timestamp ?? ''))
  );

  for (const message of ordered) {
    for (const card of cardsFromMessage(message)) {
      const set = setOf(card.id);
      if (released.has(set.toUpperCase())) continue;

      if (!sets.has(set)) sets.set(set, { set, cards: new Map(), first: null, last: null });
      const entry = sets.get(set);

      if (!entry.cards.has(card.id)) {
        entry.cards.set(card.id, {
          id: card.id,
          image: card.image,
          name: card.name ?? null,
          text: card.text ?? null,
          seen: message?.timestamp ?? null,
          source: message?.id ?? null,
        });
      } else {
        const held = entry.cards.get(card.id);
        if (card.image && !held.image) held.image = card.image;
        /* A later post that finally explains the card fills in what was missing. */
        if (card.name && !held.name) held.name = card.name;
        if (card.text && !held.text) held.text = card.text;
      }

      const at = message?.timestamp ?? null;
      if (at) {
        if (!entry.first || at < entry.first) entry.first = at;
        if (!entry.last || at > entry.last) entry.last = at;
      }
    }
  }

  return [...sets.values()]
    .map((entry) => ({
      set: entry.set,
      cards: [...entry.cards.values()].sort((a, b) => a.id.localeCompare(b.id)),
      first: entry.first,
      last: entry.last,
    }))
    .sort((a, b) => String(b.last ?? '').localeCompare(String(a.last ?? '')));
}

/**
 * The newest message id in a batch, for the next run to read after.
 *
 * Discord ids are snowflakes: they sort by time as integers, and as strings only
 * while they are the same length. They are the same length today and will be for
 * years, but comparing them as BigInt costs nothing and does not have a date on
 * which it starts being wrong.
 */
export function newestId(messages) {
  let newest = null;
  for (const message of messages) {
    const id = message?.id;
    if (!id || !/^\d+$/.test(id)) continue;
    if (newest === null || BigInt(id) > BigInt(newest)) newest = id;
  }
  return newest;
}
