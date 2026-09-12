const CARD_ID = /\b([A-Z]{1,4}\d{0,2})-(\d{3})(?![\dx])/gi;

export function cardIds(text) {
  const out = new Set();
  for (const m of String(text ?? '').matchAll(CARD_ID)) {
    out.add(`${m[1].toUpperCase()}-${m[2]}`);
  }
  return out;
}

export const setOf = (id) => id.split('-')[0];

function partsOf(message) {
  const parts = [message];
  for (const snapshot of message?.message_snapshots ?? []) {
    if (snapshot?.message) parts.push(snapshot.message);
  }
  return parts;
}

export const textOf = (message) =>
  partsOf(message)
    .map((p) => p?.content ?? '')
    .filter(Boolean)
    .join(' ');

export const filesOf = (message) =>
  partsOf(message).flatMap((p) => p?.attachments ?? []);

export function cardsFromMessage(message) {
  const found = new Map();

  const note = (id, image) => {
    const held = found.get(id);
    if (!held) found.set(id, { id, image: image ?? null, name: null, text: null });
    else if (!held.image && image) held.image = image;
  };

  for (const id of cardIds(textOf(message))) note(id, null);

  for (const attachment of filesOf(message)) {
    const name = attachment?.filename ?? '';
    const ids = [...cardIds(name)];
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

const MOST_TEXT = 600;

const COLOURS = ['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'];

export function cleanMarkup(text) {
  return String(text ?? '')
    .replace(/```+/g, ' ')
    .replace(/<a?:\w+:\d+>/g, ' ')
    .replace(/<[@#][&!]?\d+>/g, ' ')
    .replace(/@\w[\w'’-]*(?:\s+[A-Z][\w'’-]*)*/g, ' ')
    .replace(/[*_~`|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function describe(text, id) {
  const said = cleanMarkup(text)
    .replace(new RegExp(id, 'gi'), ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\p{Pd}:|]+/u, '')
    .trim();

  if (!said || said.length > MOST_TEXT) return { name: null, text: null };

  const at = said.search(new RegExp('\\b(?:' + COLOURS.join('|') + ')\\b'));
  const name = at > 0 ? said.slice(0, at).trim() : null;
  const rest = at > 0 ? said.slice(at).trim() : said;

  return {
    name: name && name.length >= 2 ? name : null,
    text: rest.length >= 8 ? rest : null,
  };
}


export function revealsFromMessages(messages, released = new Set()) {
  const sets = new Map();

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

export function newestId(messages) {
  let newest = null;
  for (const message of messages) {
    const id = message?.id;
    if (!id || !/^\d+$/.test(id)) continue;
    if (newest === null || BigInt(id) > BigInt(newest)) newest = id;
  }
  return newest;
}
