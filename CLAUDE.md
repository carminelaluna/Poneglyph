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
| `npm run ingest:events` | Official events from Bandai — Regionals, Finals, Cups |
| `npm run build:indexes` | **Run after any deck ingest** — derives everything |
| `npm run ingest:images` | Mirror card art from the official CDN into `public/cards` |
| `npm run build:cdn` | Convert that mirror to WebP at 3 widths, into `cdn/` |
| `npm run build:cdn:lock` | Same, plus a referrer check — **read the cost first** |
| `npm run deploy:cdn` | Upload `cdn/` to Cloudflare Pages |
| `npm run build:static` | `out/` for GitHub Pages — needs `NEXT_PUBLIC_CDN_URL` |
| `npm run serve:static` | Serve `out/` on 4322 **the way Pages does** — see below |
| `npm run deploy:site` | Push `out/` to the site repo |

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
ingest-events.mjs    Bandai   -> data/events-official.json (+ public/data)
build-indexes.mjs    all      -> public/data/decks-{en,jp}-{index,archive}.json,
                                public/data/decks-{en,jp}/*.json,
                                public/data/{events,players,deck}/*.json (64 each),
                                public/data/{leaders,card-names}.json,
                                data/decks-merged.json, data/regions.json
build-static.mjs     the app  -> out/            (GitHub Pages)
deploy-site.mjs      out/     -> the site repo
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
works with no CDN configured. `build:static` refuses to run without it — there is no
proxy in an export, so every image would 404.

**Never `fetch('/data/…')`.** Next rewrites `<Link>` hrefs and asset URLs when
`basePath` is set; it does not touch `fetch`. On a project page that asks the account
root for a file one directory down and gets the 404 page back — as JSON, which fails
to parse and reads like a corrupt payload rather than a wrong URL. Everything goes
through `dataUrl()` in `lib/paths.ts`.

---

## Deck builder

`/deckbuilder` builds a deck in the page: the card index it reads is the same 176 KB
file card search already downloads, the rules are in `lib/deck-rules.ts`, and there
is no server to save to.

**A deck lives in the address bar and in localStorage**, encoded from the card
*numbers* — never by looking each one up in the loaded index. Doing that made saving
depend on a fetch: on the first render after a reload the index was still in flight,
the encoder returned the empty string, and the effect wrote that over the deck it had
just restored. The deck was gone before anyone saw it.

**The colour rule is a warning, not an error.** Every colour on a card has to be a
colour on its Leader — checked against 63,155 card-and-leader pairs from recorded
decks, with not one exception. (Four rows appear to break it and all come from a
single decklist whose data is wrong: that Leader is mono-Purple in its other 63
decks.) It stays a warning because `P-117 Nami` carries a deckbuilding clause in its
own text and a future Leader can too. Refusing the card would be confidently wrong;
flagging it is only noisy.

Errors are what the rules state and this data can check — fifty cards, four copies of
a card number, the banned list, rotation. `ingest-banlist.mjs` writes a
numbers-only copy to `public/data/banlist.json` for this; the `/banlist` page imports
the build-time file and does not need it.

**Sets is not in the nav.** Browsing by set is a filter on the card archive and
`/cards` already has that facet — two menu entries answering one question. The set
pages stay, linked from every card and from the footer.

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

**Restricting the bundle to the site costs the free tier.** `_headers` names the site
in `Access-Control-Allow-Origin` instead of `*` and adds `X-Robots-Tag: noindex`.
Neither stops hotlinking — an `<img>` makes no CORS request and never reads that
header — but both are free, and nothing here fetches these URLs with JavaScript.

Actually refusing foreign requests needs per-request logic, and Cloudflare bills it
plainly: *"requests to static assets are free and unlimited. A request is considered
static when it does not invoke Functions."* Root middleware matches every path, so
turning it on means **no request to the bundle is static any more** — all of them
count against the free plan's 100,000 Functions requests a day. A card grid is 60
images, so roughly 1,600 grid views before images start failing.

`npm run build:cdn:lock` writes that middleware; plain `build:cdn` does not. Weigh it
against what it buys: `Referer` is chosen by the client, so anyone who wants to
hotlink sets it and walks through, and the bandwidth it would spend is the unmetered
kind. It stops casual embedding, at the cost of a cap.

`wrangler` is a devDependency, not `npx` — the npm script resolves the local binary.
The deploy passes `--branch poneglyph-art` because that is the project's production
branch: this folder is not a git repo, so without it wrangler cannot infer a branch
and the upload lands as a *preview* on a different hostname.

## One repository, two branches

[carminelaluna/Poneglyph](https://github.com/carminelaluna/Poneglyph).

**`main-node`** holds the code, the ingests and the data. It runs with `npm`, it is
where every change is made, and it is the only history that matters. It is the
default branch.

**`main-selfhost`** holds `out/` and nothing else — an orphan branch sharing no
history with `main-node`. `deploy:site` rebuilds it from scratch each time: fresh
`git init`, one commit, force push. That is safe precisely because nothing on it was
ever authored; it all came out of a build. Roll back by checking out an older commit
on `main-node` and building again.

The force push is aimed at a branch name, so `deploy-site.mjs` refuses `main-node`,
`main` and `master` outright — pointing it at the source would delete the project.

```
PONEGLYPH_SITE_REMOTE=https://github.com/carminelaluna/Poneglyph.git
PONEGLYPH_SITE_BRANCH=main-selfhost
NEXT_PUBLIC_BASE_PATH=/Poneglyph       # project page; empty for a user page or domain
```

**Pages is not on yet, and cannot be.** The repository is private and the account is
on the free plan; `POST /repos/…/pages` answers *"Your current plan does not support
GitHub Pages for this repository."* Making it public is the free route, and that is
the owner's call, not a build step.

**Never `shell: true` when spawning git.** Node concatenates the arguments and hands
the string to cmd.exe unescaped, so `--message "Site build 2026-08-25T…"` arrived as
three pathspecs. `deploy-site.mjs` also sets `core.autocrlf=false` on the generated
repo: Pages serves what it checks out, and CRLF conversion would alter the RSC
payloads and JSON byte for byte on the way to the browser.

## The static build

`npm run build:static` is not `npm run build` with a flag — four things have to be
true that are not true of the server build, and each was found by the deploy
failing.

**`/art/[id]` cannot exist.** `output: 'export'` refuses to build while any route
handler does, correctly — nothing can run it. `build-static.mjs` moves it to
`.art-route-parked` *outside* `src/app` and puts it back in a `finally`. Parking it
in place does not work: everything under the app directory is a route, dot-prefixed
or not, and it was collected as `/.art-parked-during-export/[id]`.

**`.next` must be deleted first.** Next caches a type validator naming every route
it has seen. A cache from a normal build still names the art proxy, and the export
then fails typechecking on a file that was just moved — reported as a broken import
inside a generated file.

**`.nojekyll` must be in `out/`.** GitHub Pages runs Jekyll, and Jekyll skips
anything whose name starts with an underscore. Next puts the whole application in
`_next/`. Without that file the deploy succeeds and the site is unstyled and inert.

**Prefetch payloads need flattening.** The router asks for
`/decks/__next.decks.__PAGE__.txt`; the export writes
`out/decks/__next.decks/__PAGE__.txt`. Segments are joined with dots in the URL and
slashes on disk, so every prefetch misses — and on a static host a miss is answered
with the full 40 KB `404.html`. Fifteen links on a page is half a megabyte of error
pages. The build writes each payload under the flat name too.

**The build id must be derived, not random.** Next generates a random `BUILD_ID` per
build and writes it into every page and every RSC payload — 4,735 files. Two builds
of *identical data* differed in 23,667 of 24,196 files, so each deploy force-pushed
466 MB of new git objects; twice a day, the repository passes a gigabyte in two days.
`generateBuildId` in `next.config.mjs` hashes `data/` instead, and two builds of the
same data are now byte-identical — measured, 0 files changed. Do not replace it with
a timestamp or a random value.

That was not the bundler: switching Turbopack to webpack changed nothing, the same
23,667 files still moved. webpack is kept anyway because its chunk names are content
addressed, so unchanged code keeps its filenames.

`serve:static` is the only way to test this locally. `npm run start` runs the Next
server, which resolves routes itself and will happily render a page the export never
wrote. It reads `NEXT_PUBLIC_BASE_PATH` and mounts `out/` under it — serving at the
root answers every asset with `404.html` and shows an unstyled page, which fails
differently from production and so proves nothing.

## Rendered in the browser, not prerendered

`/event/[id]`, `/player/[slug]` and `/deck/[id]` fetch their own data. Prerendering
all 37,000 costs **5.5 GB** against GitHub Pages' 1 GB; shipping a whole region so a
page can find its three rows costs 362 KB gzipped to draw one small event.

So `build-indexes.mjs` groups the corpus by entity into **64 buckets** and a page
pulls the one its id falls in — 11–15 KB. `shardOf` is FNV-1a and exists **twice**,
in `build-indexes.mjs` and `src/lib/shards.ts`; if they drift every lookup misses and
every page reads "not found". Same for `playerSlugOf` against `playerSlug` in
`lib/meta.ts` — note it is *not* the script's `slugify`, which truncates at 48 rather
than 64.

The prerender lists stay: an event with a real field, a regular, a notable finish.
What they buy is a 200 and a title written from the data. **Everything else is
reached through `404.html`**, which reads `location.pathname` and renders the same
view — a real HTTP 404 under a correct page, which is the trade for not spending the
5.5 GB. Those pages carry no search value; the Regionals do, and they are prerendered.

`out/cards` holds both the card pages and the mirrored PNGs — `/cards/OP01-025.png`
beside `/cards/op01-025/`. The build strips the images only; removing the directory
takes the archive with it.

## Payload budget

The metagame page is the heaviest thing on the site. Keep it honest.

| File | gzip | Used by |
| --- | --- | --- |
| `cards-index.json` | 176 KB | card search |
| `decks-en-index.json` | 107 KB | English table, last 90 days |
| `decks-jp-index.json` | 33 KB | Japanese table, last 90 days |
| `decks-{en,jp}-archive.json` | 219 / 100 KB | fetched only for "All" or an old era |
| `decks-{en,jp}/{leaderId}.json` | 6–15 KB | one archetype's card lists |
| `events/{NN}.json` | 11 KB | one event page (64 buckets) |
| `players/{NN}.json` | 13 KB | one player page (64 buckets) |
| `deck/{NN}.json` | 15 KB | one decklist's row (64 buckets) |
| `leaders.json` · `card-names.json` | 1.5 / 19 KB | archetype names · decklist names |

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

**Bandai's event pages are server-rendered.** They were written off twice as
client-rendered, both times after reading the first sixty lines and finding only
navigation. The events are further down the same HTML, and there are 67 of them.
Check the whole document before concluding a page has no data — and note that
`grep -c` counts *lines*, which on minified HTML is one.

Three things about parsing them:

- The layout varies. The event name is `<h5>` on the Regionals page and `<h4>` on the
  Mall Tour one; the fields sit bare with `<br>` on one page, in `<div>` on another,
  and wrapped as `<strong>Date: </strong>value` on a third — where "everything up to
  the next tag" is the empty string. `lines()` flattens first and reads by label.
- The real name is often not the heading. Finals headings are `[Season 1]`, shared by
  three events; the organiser is in a `<strong>` and the region in the preceding
  `<h4>`. A heading that is identical across every event on a page is dropped — that
  is how "Event Schedule and Tournament Organizer" stopped appearing on all 28 rows.
- Their text carries zero-width characters. One date ends `2026` + U+200B. `decode()`
  strips U+200B/C/D, U+FEFF and U+00A0, written as escapes rather than literals.

**When registration opens is published, and it is a guideline.** At the foot of the
Regionals, Treasure Cup and Extra Grand Battle pages is an *Application Period*
table: one opening date per event month (`For August Events: May 24, 2026`) and a
time per region. Every one of those dates is a **Sunday** — checked, all five.

In the same block Bandai writes that *"the exact registration date and time may vary
by tournament organizer"* and that the table is *"a guideline provided only for
reference"*. That caveat travels with the data and is printed on the page. Where an
event carries its own note — `*Registration begins 2nd August 9AM(CEST)` — that is
exact and wins over the table.

Both the table and the region headings are read from `lines()`, not from the markup:
the dates are bare text split by `<br>` on one page while the region times are `<h5>`
headings with the value in a later element on another.

**Regions come from their headings first, the address second.** `North America`,
`Europe`, `Oceania` and `Latin America` appear as headings above groups of events —
`<h4>` on the Finals pages, `<h5>` on the Regionals one — so a heading is matched
*by name* rather than by level. Matching by level is what let "Event Schedule and
Tournament Organizer" be read as a place. `regionOf()` falls back to scanning the
whole address, not its last segment: some venues end in a hall name or a US zip.

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
| [Bandai events](https://en.onepiece-cardgame.com/events/) | Regionals, Finals, Cups — dates, venues, registration | HTML, no API |

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
`update-spoilers` (6h), `update-events` (daily, 10:00 UTC — noon in Italy on summer
time, 11:00 in winter; cron has no timezone). Each commits only when something
substantive changed, which
is **`node scripts/substantive-change.mjs`** — stage everything, then ask.

Naming the files that lack a timestamp does not work, and had already failed twice.
`spoilers.json`, `banlist.json`, `regions.json` and `meta.json` all carry
`generatedAt` and `durationMs`, so three workflows committed on *every* run and each
commit rebuilt and redeployed the whole site to publish a new timestamp: spoilers
four times a day, rules three, prices twice. The two that did name files instead
went stale the moment the per-entity shards appeared and were not on the list.

**Always `git add data public/data`.** Two workflows did not: `update-decks` staged
only `data/`, and `update-rules` named individual files, an list that went stale the
moment the per-entity shards appeared. Both run `build-indexes.mjs`, which writes
every payload the browser fetches into `public/data` — so the archive refreshed and
the site kept serving the previous ingest. Nothing fails when a payload is missing;
the page just reads "not found".

`publish-site` builds and force-pushes to `main-selfhost`. It runs on `workflow_run`,
not `on: push`, because **a commit made with `GITHUB_TOKEN` does not trigger another
workflow** — GitHub's own loop protection — so a push trigger would never fire and
the site would sit at the last manual deploy.

**Actions minutes are only unmetered on a public repository.** A private one gets
2,000 a month on the free plan, and `update-decks` alone spends about 1,800 of them:
a 300-request budget waits out six rate-limit windows, roughly 30 minutes per run,
twice a day, and waiting is billed like working.

**Let CI do the deploying.** The build is deterministic for a given Node version but
not across them: CI pins 22, and building the same commit on 26 produced five
different app chunks out of twelve — and with them every page that references one.
CI against CI is byte-identical, which is what keeps the pushes small; a manual
`deploy:site` from a different Node is a one-off large push, not a broken site.

---

## Current shape

2,785 cards · 4,843 printings · 60 sets · 2,172 Standard-legal (20 via the block
exception) · 20,941 decklists (English 15,092 from 2022-10, Japanese 5,849 from
2022-07) · 7,150 events · 8,701 players · 43/46 release windows.
