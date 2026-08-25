# Poneglyph — working notes

Unofficial ONE PIECE CARD GAME archive and metagame tracker. Next.js 16 (App
Router), TypeScript, no database — ingest scripts write JSON, the site is built
from it.

**Every page carries a Bandai disclaimer. Do not remove it, and do not add anything
that implies official standing.** `/legal` is the full notice.

---

## Commands

| | |
| --- | --- |
| `npm run dev` | Dev server, port 4321 |
| `npm run build` | ~4,700 static pages, about 50s |
| `npm run check` | Fails on stray control characters — see Gotchas |
| `npm run ingest` | Cards (runs `check` first) |
| `npm run ingest:decks` | Limitless tournaments, budgeted and resumable |
| `npm run ingest:topdecks` | Top Decks archives, both regions |
| `npm run ingest:spoilers` | Unreleased sets |
| `npm run ingest:banlist` | Banned & restricted list |
| `npm run build:indexes` | **Run after any deck ingest** — derives everything |
| `npm run ingest:images` | Mirror card art from the official CDN into `public/cards` |
| `npm run build:cdn` | Convert that mirror to WebP at 3 widths, into `cdn/` |
| `npm run deploy:cdn` | Upload `cdn/` to Cloudflare Pages |

`build:indexes` is not optional plumbing: it merges the corpora, deduplicates,
derives release eras, and writes both the browser payloads and
`data/decks-merged.json`. A deck ingest without it leaves the site on stale data.

---

## Pipeline

```
sources.mjs          every upstream, with its role and limits
ingest.mjs           cards    -> data/cards|sets|filters|meta.json + cards-index
ingest-decks.mjs     Limitless -> data/decks|tournaments|decks-state.json
ingest-topdecks.mjs  Top Decks -> data/decks-{en,jp}.json
ingest-spoilers.mjs  leaks    -> data/spoilers.json
ingest-banlist.mjs   Bandai   -> data/banlist.json
build-indexes.mjs    all      -> public/data/decks-{en,jp}-{index,archive}.json,
                                public/data/decks-{en,jp}/*.json,
                                data/decks-merged.json, data/regions.json
```

`data/*.json` is imported at build time. `public/data/*.json` is fetched by the
browser. Never import a `public/data` file into a component — it exists precisely
to stay out of the bundle.

---

## Invariants

These are load-bearing. Breaking one produces plausible-looking wrong numbers.

**Cards vs printings.** A card is the gameplay entity; `OP01-025`, `_p1`, `_p2` are
printings of it. Search returns 2,785 cards, not 4,843 printings. The UI labels
them `OP01-025`, `OP01-025 V2`, `V3` — the `_pN` suffix is an image filename, not
something on the card.

**Sampling is per deck, not per corpus.** Limitless publishes whole Swiss fields;
Top Decks publishes only decks that placed. Each deck row carries `f: 1|0`.
*Share* counts every deck; *win rate* counts only `f === 1` rows and displays its
sample (`52.8% /195`). A win rate over winners-only data reads near 100% and means
nothing.

**Regions are separate corpora, not a filter.** English and Japanese have different
card pools and event structures. Switching region swaps the dataset.

**English is deduplicated.** Limitless and Top Decks both cover 2026 English
events; 223 lists appear in both. A duplicate is same day + player + Leader + *the
same fifty cards*. The looser key matched 242, but 19 had different lists and a
player can bring one archetype to two events in a day. Limitless wins the tie.

**Windows are measured from the newest deck on record, not from today.** Results
arrive in batches; anchoring on the clock would silently empty "last 7 days"
whenever ingestion paused.

**Release eras are derived, never hardcoded.** A date is claimed only when the set
first appears after the corpus starts, reaches ≥10% of decks in a 7-day stretch,
*and* brings ≥3 distinct cards. All three matter: ST-01 shipped in 2022, but one of
its cards entered play mid-corpus and hit 17% — a deckbuilding trend, not a release.
The date is when a set entered *competitive play*, not its paper release (OP-17:
played 2026-08-17, printed 2026-08-28).

**Standard legality has a published exception.** Standard is Block ≥ 2
(`STANDARD_MIN_BLOCK`), but Bandai keeps 20 Block 1 cards legal and
[lists them](https://en.onepiece-cardgame.com/rules/blockicon-card/). Read that
page; do not infer. Upstream reports block 1 for every printing including reprints,
and "has an alternate art" is not the rule.

**Missing values are named, not blanked.** `Not recorded` for absent players,
events, records and field sizes. A blank reads as a bug; a `0` field size reads as
"nobody came". `NA` is not a player — it is the most common name in the raw data
(172 rows) and would top every leaderboard.

**Card art is fetched once, never hotlinked.** The official CDN sends
`Cross-Origin-Resource-Policy: same-site`, so a browser refuses to render its
images from another origin — verified, still true. `/art/[id]` fetches server-side
(where that header does not apply) and mirrors to `public/cards`.

**Art is served at the width it is rendered.** One 600x838 source appears at 38 px
in a table row and 600 px in the lightbox; sending the original to both is what
made a grid of 60 cards weigh 18 MB. `art(id, width)` takes 96, 320 or 600, and
`artSrcSet` offers all three. Both live in `lib/art.ts` — **not** `lib/cards.ts` —
because the client grids need them and importing from `cards.ts` would drag 4.4 MB
of card JSON into the browser bundle.

With `NEXT_PUBLIC_CDN_URL` unset the proxy answers instead, so a fresh checkout
works with no CDN configured.

---

## Card art

| | |
| --- | --- |
| Source | 4,843 PNG · 1.66 GB · 348 KB average |
| Bundle | 14,529 WebP · ~700 MB · 96 / 320 / 600 px |
| A grid tile | 348 KB → **30 KB** |
| A grid page | 18 MB → **~1.5 MB** |

Hosted on Cloudflare Pages as an assets-only project. Not R2: without a custom
domain R2 serves from `r2.dev`, which Cloudflare rate-limits, calls development-only,
and — decisively — **does not put behind its cache**. Pages gives a free
`*.pages.dev` subdomain that is on the CDN by default, with unmetered static
requests.

The binding constraint is **20,000 files per deployment** on the free plan;
`build-cdn.mjs` refuses to run past it rather than failing at upload. `_headers`
sets a one-year immutable cache, which is the thing GitHub Pages cannot do.

`wrangler` is a devDependency, not `npx` — the npm script resolves the local binary.
The deploy passes `--branch poneglyph-art` because that is the project's production
branch: this folder is not a git repo, so without it wrangler cannot infer a branch
and the upload lands as a *preview* on a different hostname.

## Payload budget

The metagame page is the heaviest thing on the site. Keep it honest.

| File | gzip | Used by |
| --- | --- | --- |
| `cards-index.json` | 176 KB | card search |
| `decks-en-index.json` | 107 KB | English table, last 90 days |
| `decks-jp-index.json` | 33 KB | Japanese table, last 90 days |
| `decks-{en,jp}-archive.json` | 219 / 100 KB | fetched only for "All" or an old era |
| `decks-{en,jp}/{leaderId}.json` | 6–15 KB | one archetype's card lists |

Two things were tried and are worth not repeating: **interning** repeated event and
player names made the file *larger* (gzip already collapses that), and shipping the
whole English corpus cost 324 KB for a page most people open to ask about last
month. Splitting by recency is what worked.

---

## Gotchas

**Control characters in regexes.** A `\b` written through a patch became a literal
`0x08` three separate times. It is invisible in an editor and in a diff, the regex
compiles, and it matches nothing. The last one made the block-update list read as
empty — twenty legal cards silently reported as rotated out. `npm run check` now
fails on this and runs before the card ingest. When editing a regex through a
script, verify with `grep … | cat -A`.

**Rate limit.** Limitless advertises `RateLimit: "50-in-5min"` in its headers. The
deck ingest reads that header and pauses *before* being refused. Do not raise
`--max` expecting it to go faster; it will just wait.

**`decks-state.json` holds `details`.** That map is the only copy of each event's
venue. An earlier "slimming" of the loader dropped it, and a rebuild silently
reclassified all 275 tournaments as `unknown`. Re-fetching cost 289 requests.

**Ingests refuse to write nonsense.** Too few cards, an empty banlist, a dead spine
— each aborts before overwriting. Keep it that way: an empty banlist that looks
successful is worse than no banlist.

**Windows and WSL share one `node_modules`.** The project lives on the Windows
filesystem, so running `npm` from WSL over `/mnt/c` reuses the same install — and
native modules only ship one platform's binary. `wrangler` (via `workerd`) and
`sharp` both fail with "you installed X on another platform" when the install and
the runtime disagree.

Both platforms' binaries are present, with the ones for the *other* platform in
`optionalDependencies` so a clean `npm install` skips what does not apply instead
of hard-failing. If a platform's binary goes missing:

```bash
npm i -D --force @cloudflare/workerd-linux-64@<matching-workerd-version>   @img/sharp-linux-x64 @img/sharp-libvips-linux-x64
```

`--force` is required because npm refuses an os-mismatched package otherwise. The
`workerd-linux-64` version must match the `workerd` version wrangler pulled in.

Uploads are also markedly faster from Windows than from WSL over `/mnt/c`, which
matters for a 716 MB, 14,530-file deploy.

**Dev server port.** 4321. Earlier ports were left occupied by a WSL relay; if
`preview_start` reports a port in use, change it in `.claude/launch.json` *and*
`package.json` together.

---

## Sources, and what they allow

| Source | Role | Access |
| --- | --- | --- |
| [Punk Records](https://github.com/buhbbl/punk-records) | Cards — every printing, typed | Static JSON |
| [Vegapull Records](https://github.com/Coko7/vegapull-records) | Rules text in bulk | Static JSON |
| [OPTCG API](https://optcgapi.com/) | Prices, set names | Public REST |
| [Limitless](https://onepiece.limitlesstcg.com) | Tournaments + full decklists | Documented API, no key |
| [Top Decks](https://onepiecetopdecks.com) | JP/EN archives, leaks | WordPress API + query-string decks |
| [Bandai rules](https://en.onepiece-cardgame.com/rules/) | Banlist, block updates | HTML, no API |

**Do not point card images at anyone else's CDN.** Bandai's blocks browser
embedding outright. The optcgapi mirror does not, but a 24-printing sample found
~83% coverage — OP-17, promos and many alt arts are missing — and it would be their
bandwidth for every view, at 348 KB a card, with no way to resize.

**Do not integrate onepiece.gg.** Its `robots.txt` names `anthropic-ai`,
`Claude-Web`, `GPTBot` and `ChatGPT-User` as disallowed and its pages 403
non-browser clients. That is an explicit opt-out. Link to it; never fetch it.

**optcg.one** disallows `/api/`. **matchmaking.gg** is a parked domain for sale, not
a TCG site.

Top Decks card scans are referenced from their server with attribution, not copied.
Pre-release art is not ours to re-host.

---

## Scheduled jobs

`update-cards` (daily, gated on `ingest.mjs --check` which exits 3 when current),
`refresh-prices` (2×/day), `update-decks` (2×/day), `update-rules` (8h),
`update-spoilers` (6h). Each commits only when the substantive files changed —
`meta.json` carries a fresh timestamp every run and must be excluded from that
comparison.

---

## Current shape

2,785 cards · 4,843 printings · 60 sets · 2,172 Standard-legal (20 via the block
exception) · 20,941 decklists (English 15,092 from 2022-10, Japanese 5,849 from
2022-07) · 7,150 events · 8,701 players · 43/46 release windows.
