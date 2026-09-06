# Poneglyph — working notes

Unofficial ONE PIECE CARD GAME archive and metagame tracker. Next.js 16 (App
Router), TypeScript, **no database** — ingest scripts write JSON, the site is built
from it. Accounts are the one exception (Supabase: saved decks, organizer
submissions).

This file is the condensed version. The long form — the reasoning behind each
decision and the bug that produced it — is in git history before the commit that
shortened it.

**Every page reaches the Bandai disclaimer, and no page restates it.** The full
notice is `/legal`, shown once in a dismissible first-visit banner, linked from
every footer. `/privacy` and `/terms` are the two URLs the OAuth providers require.
Do not add anything implying official standing.

**A page opens on its content, not on a paragraph about itself.** Caveats live on
the page that exists for them — `/data` for how the archive is built, `/legal` for
what this site is and is not. A browse page keeps at most one line of provenance
(`.source-line`) and a link. The exception is a *conditional* warning describing the
table in front of you right now; those stay.

---

## Commands

| | |
| --- | --- |
| `npm run dev` | Dev server, port 4321 — **under `NEXT_PUBLIC_BASE_PATH`** |
| `npm run build` | Server build, ~8,700 pages |
| `npm run verify` | `check` + `typecheck` + `test` — what CI runs |
| `npm run check` | Control characters, reserved SQL column names, recursive policies |
| `npm test` | `node --test` over `tests/*.test.ts` |
| `npm run ingest` | Cards, and a price point |
| `npm run ingest:decks` | Limitless tournaments, budgeted and resumable |
| `npm run ingest:decks -- --backfill --since 2023-01-01` | Reach past where the archive is |
| `npm run ingest:decks -- --rebuild` | Re-derive from stored decks, no network |
| `npm run ingest:matchups` | Limitless pairings — one request per tournament |
| `npm run ingest:topdecks` | Top Decks archives, both regions |
| `npm run ingest:spoilers` | Unreleased sets |
| `npm run ingest:discord` | Reveals from a Discord channel — **needs a bot token** |
| `npm run ingest:banlist` | Banned & restricted list |
| `npm run ingest:events` | Official events from Bandai |
| `npm run ingest:submissions` | Approved organizer tournaments — needs the service key |
| `npm run build:indexes` | **Run after any deck ingest** — derives everything |
| `npm run ingest:images` | Mirror card art into `public/cards` |
| `npm run build:cdn` | That mirror to WebP at 3 widths, into `cdn/` |
| `npm run deploy:cdn` | Upload `cdn/` to Cloudflare Pages |
| `npm run build:static` | `out/` for GitHub Pages — needs `NEXT_PUBLIC_CDN_URL` |
| `npm run serve:static` | Serve `out/` on 4322 **the way Pages does** |
| `node scripts/build-share-image.mjs` | The 1200×630 link preview, by hand |

`build:indexes` is not optional plumbing: it merges the corpora, deduplicates,
derives release eras, shards the matchups, and writes both the browser payloads and
`data/decks-merged.json`. A deck or matchup ingest without it leaves stale data.

---

## Pipeline

```
sources.mjs          every upstream, with its role and limits
deck-corpus.mjs      the deck archive, a file per year — read and write
env.mjs              .env.local as Next reads it, for the scripts that must
corpus-guard.mjs     when an answer is too small to overwrite what is recorded
dedupe.mjs           one deck in two sources: same fifty cards, or same event
refusal.mjs          an upstream that will not talk, told apart from a bug of ours
limitless.mjs        the rate limiter and request helper, shared by two ingests
matchups.mjs         a bracket -> results, and the flip that stores both sides
price-history.mjs    the append and the ninety-day trim, both pure
submissions.mjs      an organizer's answer -> corpus rows
discord.mjs          messages -> cards, pure so a test needs no bot token
ingest.mjs           cards     -> data/cards|sets|filters|meta.json + cards-index
                                  + data/price-history.json (one point per change)
ingest-decks.mjs     Limitless -> data/decks/{YYYY}.json, tournaments, decks-state
                                  (nothing under public/ — build-indexes owns those)
ingest-matchups.mjs  Limitless -> data/matchups.json (pairings, resumable)
ingest-topdecks.mjs  Top Decks -> data/decks-{en,jp}.json (guarded)
ingest-spoilers.mjs  leaks     -> data/spoilers.json
ingest-discord.mjs   Discord   -> data/spoilers-discord.json (needs a bot)
ingest-banlist.mjs   Bandai    -> data/banlist.json (+ numbers-only in public/data)
ingest-events.mjs    Bandai    -> data/events-official.json (+ public/data)
ingest-submissions   Supabase  -> data/decks-community.json (approved only)
build-indexes.mjs    all       -> public/data/decks-{en,jp}-index.json,
                                  decks-{en,jp}-archive/{YYYY-MM}.json,
                                  decks-{en,jp}/*.json,
                                  {events,players,deck}/*.json (256 each),
                                  {tournaments,players}-{index,archive}.json,
                                  matchups/{leaderId}.json,
                                  {leaders,card-names}.json,
                                  data/decks-merged.json, data/regions.json
build-static.mjs     the app   -> out/
deploy-site.mjs      out/      -> main-selfhost
```

The modules above the ingests are **pure and imported rather than inlined**, and both
properties are load-bearing: shared so two copies cannot drift, pure so a test can run
them. Each is a place where a number is decided.

`data/*.json` is imported at build time; `public/data/*.json` is fetched by the
browser. **Never import a `public/data` file into a component.**

---

## Invariants

Breaking one produces plausible-looking wrong numbers.

**Cards vs printings.** A card is the gameplay entity; `OP01-025`, `_p1`, `_p2` are
printings of it. Search returns 2,785 cards, not 4,843 printings.

**Sampling is per deck, not per corpus.** Each row carries `f: 1|0`. *Share* counts
every deck; *win rate* counts only `f === 1` and shows its sample (`52.8% /195`). A
win rate over winners-only data reads near 100% and means nothing.

**A matchup is not a win rate.** The win rate on an archetype page is its record
against *the field*. The matchup table is its record against a **named** opponent,
joined from `/tournaments/{id}/pairings` against the Leader each username played at
that tournament. Nothing is inferred from standings. It follows that matchups cover
**Limitless events only**, and show nothing under the Japanese view. Mirrors are
dropped; rows under five games are held behind a click; byes and matches whose other
side never submitted a list are dropped rather than guessed at.

**Each match is stored twice, once from each side.** `flip()` in `scripts/matchups.mjs`
is used by the writer; `tests/matchups.test.ts` reads the built payloads back and
asserts every pair agrees.

**Prices are a sparse series.** `data/price-history.json` keeps ninety days.
`prices[cardId]` holds one entry per *change*, so reading a day means the last point
at or before it — and `days` holds the days something moved **on**, not the days the
ingest ran. `sparkline()` places points **by date rather than by index**. Nothing is
back-filled: a card seen once says so rather than drawing a flat line.

**Regions are separate corpora, not a filter.** English and Japanese have different
card pools and event structures. Switching region swaps the dataset. They also do not
share a release calendar, so an era one corpus never had answers with **nothing** and
says so.

**English is deduplicated, by two tests.** `scripts/dedupe.mjs`. First: same day +
player + Leader + *the same fifty cards*. Second, for the rows that survive it: the
same **event**, which Top Decks names with its field size (`ChinoizeCup(128)`) and
Limitless records as an entrant count. The second exists because 39 rows were the same
deck typed differently by two sources, not a player at two events — which is real and
happens 354 times inside Limitless alone. Deliberately **not** list similarity: one
card apart is what both cases look like. Limitless wins the tie; community submissions
lose it.

**A release window is closed at both ends.** An era runs until the next **expansion**
entered play — not the next set of any kind, because a starter deck does not end a
format. `windowEnd()` is exclusive. Only the newest era is open.

**Windows are measured from the newest deck on record, not from today.** Results
arrive in batches; anchoring on the clock would empty "last 7 days" whenever
ingestion paused.

**Release eras are derived, never hardcoded.** A date is claimed only when a set first
appears after the corpus starts, reaches ≥10% of decks in a 7-day stretch, *and* brings
≥3 distinct cards. All three matter. The date is when a set entered *competitive play*,
not its paper release.

**Standard legality has a published exception.** Standard is Block ≥ 2, but Bandai
keeps 20 Block 1 cards legal and
[lists them](https://en.onepiece-cardgame.com/rules/blockicon-card/). Read that page;
do not infer. Upstream reports block 1 for every printing including reprints.

**Missing values are named, not blanked.** `Not recorded` for absent players, events,
records and field sizes. `NA` is not a player — it is the most common name in the raw
data and would top every leaderboard.

**Card art is fetched once, never hotlinked.** The official CDN sends
`Cross-Origin-Resource-Policy: same-site`. `/art/[id]` fetches server-side and mirrors
to `public/cards`.

**Art is served at the width it is rendered.** `art(id, width)` takes 96, 320 or 600;
`artSrcSet` offers all three. Both live in `lib/art.ts` — **not** `lib/cards.ts`,
because importing from there would drag 4.4 MB of card JSON into the client bundle.
With `NEXT_PUBLIC_CDN_URL` unset the proxy answers, so a fresh checkout works with no
CDN; `build:static` refuses to run without it.

**A flag that says what a row is *not* only works while there are two things.** `o`
on a deck row was `1` for Top Decks and absent otherwise, so the first submitted
tournament read as Limitless. It carries the source now — 1 Top Decks, 2 community,
absent Limitless. Sampling is likewise read off the rows (`f`), never from which site
they came from.

**`/prices` ranks two ways because one would be a lie by omission.** A common going
$0.24 → $2.75 is +1046% and $2.51; a chase card gaining $8.61 is +46%. Percent answers
"what is the market doing", cash answers "what is this worth now", and neither is the
real one — so both are controls and every row prints both figures whichever it is
sorted by. No blended score: a number nobody can check against the two columns beside
it is worse than two numbers.

The **floor exists only under the percent view**, because below about a dollar a
one-cent tick is a double-digit move and the ranking measures the source's rounding
rather than a market. It defaults to $1 (1,809 movers become 402) and is a control
rather than a constant, since what it hides is sometimes the thing worth seeing. The
cash view needs none: it selects for expensive cards on its own.

Windows are **recorded days, not calendar days** — `days` holds the days something
moved on. `movers()` is in `lib/prices.ts` beside `readSeries`, and skips a card whose
first point falls inside the window: there is no earlier price, and treating a first
sighting as the opening price would report a card the ingest had just met as flat.
The whole page is computed at build time and fetches nothing; `price-history.json` is
142 KB and stays server-side, the same trade the card page makes drawing its chart as
inline SVG. **Only the rows a control can reach are sent** — the eight orderings (two
sorts, three floors under the percent one, two directions, fifteen a side) have a union
of 175 rows against 3,663 that moved, which took the page from 86 KB gzipped to 11.
The count is what stops that being a lie, so it is computed over everything and sent as
a number: counting what arrived would report 90 cards moved when 1,809 did.

Only eleven days of history exist so far against a ninety-day cap, so the page offers
7d and All and says how much there is — a thirty-day window that silently answered
with eleven would be the wrong kind of confident.

**`/compare` counts wins, not share.** English is `mixed` (58,399 whole-field decks);
Japanese is `winners`, `fieldDecks: 0`. Subtracting one share from the other would be
a wrong number that looks right. First places are defined identically in both. An
empty cell reads *Not recorded* when that corpus has never held the Leader at all,
because the pools differ.

**The metagame page opens with ten archetypes**, and the rest are one click away —
which closes again whenever a control above it changes. An archetype page shows ten
matchups and ten decklists, with `/decks/[slug]/matchups` and `/decks/[slug]/decklists`
for the rest. Ten **by best finish**, not ten winners: in a default window 42 of 68
archetypes with results have no first place at all.

**The window travels with the link.** `windowQuery` in `useMeta.tsx` encodes it for
both the address bar and every *All N →* link; `useWindow` also returns `bar`, the
props `WindowBar` wants, so four views do not each write out ten.

**Never `fetch('/data/…')`.** Next rewrites `<Link>` hrefs and asset URLs under a
`basePath`; it does not touch `fetch`. Everything goes through `dataUrl()` in
`lib/paths.ts`. Same for hand-written `<img src>`: use `asset()`.

---

## Rendered in the browser, not prerendered

`/event/[id]`, `/player/[slug]` and `/deck/[id]` fetch their own data. Prerendering
all 37,000 costs **5.5 GB** against GitHub Pages' 1 GB.

`build-indexes.mjs` groups the corpus by entity into **256 buckets** and a page pulls
the one its id falls in — 11–15 KB. `shardOf` is FNV-1a and exists **twice**, in
`build-indexes.mjs` and `src/lib/shards.ts`; if they drift every lookup misses. Same
for `playerSlugOf` against `playerSlug` in `lib/meta.ts`. `tests/parity.test.ts` lifts
the *source text* of each copy and runs the two against nine thousand real keys.

`/tournaments` and `/players` are whole files split by interest rather than hash: the
last ninety days of events (12 KB) and everyone with five or more results (55 KB) up
front, the rest behind one click. Rows are positional arrays; the positions are written
in `writeDirectories` and read in `lib/directory.ts`.

Prerendered leaf pages are the ones with search value. **Everything else is reached
through `404.html`**, which reads `location.pathname` and renders the same view.

---

## Deck builder

`/deckbuilder` builds a deck in the page from the same 176 KB card index search already
downloads. Rules live in `lib/deck-rules.ts`, **free of imports** so they run the same
in the builder, the submission form and a test.

**Nothing persists unless it is saved.** `?deck=<id>` opens a *saved* deck.

**Export is one button and one format**: `{count}x{cardId}`, one per line, Leader
first — what OPTCGSim's *Import from clipboard* reads. **Import is a textarea**, not a
clipboard read: `navigator.clipboard.readText()` needs a permission Firefox does not
grant to pages.

**Imported counts are not clamped.** A pasted list with six copies keeps six and the
validator says so. Cards the archive does not have are dropped *and named*.

**The banlist covers the Leader.** Two of the five banned cards are Leaders, and the
banned pairs include a Leader. The `held` set starts with the Leader's id.

**The colour rule is a warning, not an error** — checked against 63,155 card-and-leader
pairs with no exception, but `P-117 Nami` carries a deckbuilding clause in its own text
and a future Leader can too.

**The size rule is not printed.** `validate()` still returns it, tagged `rule: 'size'`,
and the builder filters it out of the displayed list — the running `0 / 50` above says
it better. *Legal in {format}* is gated on `problems` being empty **including size**,
so filtering the message cannot announce a twelve-card deck as legal.

---

## Accounts and submissions

`supabase/schema.sql` is the whole thing; `supabase/migrations/` holds the same changes
for a project that already exists, **numbered in the order they must run**. All are safe
to run twice. Migrations are run by hand; nothing in the repo applies them.

**The role is a single column, not a set.** `user`, `organizer` or `admin`, never two.
So an admin cannot also hold the organizer role — `0006-admins-may-submit` widens the
insert on `submissions` instead.

**No client can mint an admin.** Nothing lets an account change its own `role` or a
submission's `status`. The update policy on `profiles` re-reads the stored role in its
`with check`. That is the entire security model: every number here is derived from
recorded results.

**No policy may read the table it is on.** Postgres refuses — *infinite recursion
detected in policy for relation "profiles"* — and since SELECT policies are OR'd, one
breaks *every* read of that table. Roles go through `public.has_role()` and
`public.my_role()`, `security definer` functions. `npm run check` refuses the shape.
Both are executable by `anon` as well as `authenticated`, so a signed-out read gets an
empty list rather than `42501`; neither takes a user id, so neither can probe another
account.

**PLACING is reserved in PostgreSQL.** The column is `place`; `submissions.mjs` maps it
to the corpus field `placing`. `npm run check` scans `.sql` for reserved column names.

**The flow, end to end.** Sign-up → role `user`. They ask for organizer from the
account menu (one open request per account, a partial unique index; once sent it
stands — no update or delete policy for the sender). An admin approves on `/review`.
The organizer submits on `/submit` → a **pending** submission. That is reviewed too.
`ingest-submissions.mjs` reads only `approved` rows on a schedule; `build-indexes.mjs`
folds them in as a third corpus, `source: 'community'`.

**A decision can be put back.** *Reopen* on `/review` returns a decided row to
`pending` and clears the verdict — the database always allowed it (`admins review
submissions` has no condition on status), this is the page catching up. An organizer
can withdraw their own submission while it is pending, which is a `DELETE` and
cascades to its decks.

**An event says who ran it.** The display name on the account that sent it. It costs
`ingest-submissions.mjs` a **second request**: `submissions.organizer_id` references
`auth.users`, not `public.profiles`, so PostgREST has no foreign key to embed through.
That request failing warns and writes the results anyway.

**`SUPABASE_SERVICE_ROLE_KEY` bypasses every policy.** Workflow secrets only — never in
`.env.local`, never under a `NEXT_PUBLIC_` name.

**Sign-in is OAuth first**, because Supabase's built-in mail sends two messages an hour
and is documented as non-production. The email form is **drawn but disabled**, under a
note saying SMTP is not configured — hidden, the gap was invisible to everyone; working,
it would hand somebody an unrecoverable account. `NEXT_PUBLIC_AUTH_EMAIL=1` turns it on.
One `disabled` on a `fieldset`, and note that a child input's `disabled` *property* stays
`false` under a disabled fieldset — check `matches(':disabled')`.

**One address is one account, and Supabase does that part.** Automatic identity linking
is built in and has **no switch**: it links when the email matches an existing *verified*
user, and drops unconfirmed identities on the way. The toggle is for *manual* linking:
Authentication → Providers. `linkProvider`/`unlinkProvider` in `useAccount` are uncalled
but kept — they answer the case automatic linking cannot, two accounts on different
addresses. Restoring that panel needs its CSS back too.

**A third way in cannot be policed by refusing it.** Nothing may ask "is this address
registered?" from the browser — that is an enumeration oracle. Supabase answers a
sign-up on a taken address with an obfuscated success and no mail, so the confirmation
line names Discord and Google as the thing to try instead.

The token comes back in the URL **fragment**, which browsers never send to a server —
that is what makes this work on GitHub Pages. Every value `authRedirectTo()` can produce
must be in Supabase's redirect allowlist, **with the trailing slash**.

`lib/supabase.ts` is imported **only** by pages under `/account` and `/submit`: the
library is ~100 KB. `accountsEnabled` is false on a checkout with no project.

---

## One repository, three branches

[carminelaluna/Poneglyph](https://github.com/carminelaluna/Poneglyph), public — which is
what makes Actions unmetered and Pages free.

**`prod`** holds the code, the ingests and the data. Default branch, what the site is
built from. **`dev`** is the same for work in progress. **`main-selfhost`** holds `out/`
and nothing else, an **orphan** branch rebuilt from scratch each deploy: fresh
`git init`, one commit, force push. It shares no history with `prod` and **must never be
merged in either direction**.

**The ingests commit to `prod`.** They name no branch; `actions/checkout` gives them the
default one. So `prod` moves ahead of `dev` twice a day without anybody touching code —
**`dev` rebases onto `prod`, never the other way**, and nothing on `dev` writes into
`data/` or `public/data/`.

`deploy-site.mjs` refuses `prod`, `dev`, `main-node`, `main` and `master` as a force-push
target. **Never `shell: true` when spawning git** — Node hands the string to cmd.exe
unescaped. It also sets `core.autocrlf=false` on the generated repo: Pages serves what it
checks out, and CRLF conversion would alter RSC payloads byte for byte.

**Pages rebuilds can take a long time.** `Publish site` finishing is not the site being
live — check `gh api repos/…/pages --jq .status` before assuming anything is wrong.

```
PONEGLYPH_SITE_REMOTE=https://github.com/carminelaluna/Poneglyph.git
PONEGLYPH_SITE_BRANCH=main-selfhost
NEXT_PUBLIC_BASE_PATH=/Poneglyph       # project page; empty for a domain
```

---

## The static build

`npm run build:static` is not `npm run build` with a flag. Five things must be true.

**`/art/[id]` cannot exist.** `output: 'export'` refuses to build while any route
handler does. `build-static.mjs` moves it to `.art-route-parked` *outside* `src/app` and
puts it back in a `finally` — everything under the app directory is a route,
dot-prefixed or not.

**`.next` must be deleted first.** Next caches a type validator naming every route it has
seen, and the export then fails typechecking on a file that was just moved.

**`.nojekyll` must be in `out/`.** Jekyll skips anything starting with an underscore, and
Next puts the whole application in `_next/`. `CNAME` is written from `PONEGLYPH_CNAME` for
the same reason — one added through the settings screen lives in the branch the next
deploy replaces.

**Prefetch payloads need flattening.** The router asks for
`/decks/__next.decks.__PAGE__.txt`; the export writes it at a nested path. Every prefetch
would miss, and a miss on a static host is answered with the whole 40 KB `404.html`.

**The build id must be derived, not random.** `generateBuildId` in `next.config.mjs`
hashes `data/`, so two builds of the same data are byte-identical. Do not replace it with
a timestamp.

`build-static.mjs` also signs `robots.txt`: it inserts
`Content-Signal: search=yes,ai-input=yes,ai-train=no` **into** the `User-agent: *` group
Next already wrote, rather than adding a second one — two groups of one name is ambiguous.
Eight training crawlers are disallowed in `robots.ts`, `ClaudeBot` among them, which is
the same request this project honours when it is on the other side of it.

`out/cards` holds both the card pages and the mirrored PNGs. The build strips the images
only; removing the directory takes the archive with it.

`serve:static` is the only way to test this locally. `npm run start` resolves routes
itself and will render a page the export never wrote.

---

## Card art and the CDN

| | |
| --- | --- |
| Source | 4,843 PNG · 1.66 GB · 348 KB average |
| Bundle | 14,529 WebP · ~700 MB · 96 / 320 / 600 px |
| A grid page | 18 MB → **~1.5 MB** |

Cloudflare Pages, assets-only. Not R2: without a custom domain R2 serves from `r2.dev`,
which Cloudflare rate-limits and does not cache. The binding constraint is **20,000 files
per deployment** on the free plan; `build-cdn.mjs` refuses to run past it.

**Restricting the bundle to the site costs the free tier.** Root middleware matches every
path, so `build:cdn:lock` means no request is static any more — all count against 100,000
Functions requests a day, roughly 1,600 grid views. Plain `build:cdn` removes it again.

`wrangler` is a devDependency, and the deploy passes `--branch poneglyph-art` because that
is the project's production branch.

---

## Payload budget

| File | gzip | Used by |
| --- | --- | --- |
| `cards-index.json` | 183 KB | card search, deck builder, submission form |
| `decks-en-index.json` | 119 KB | English table, last 90 days |
| `decks-jp-index.json` | 40 KB | Japanese table |
| `decks-{en,jp}-archive/{YYYY-MM}.json` | 20 KB median | the months an older window covers |
| `decks-{en,jp}/{leaderId}.json` | 4 KB median, 74 KB worst | one archetype's card lists |
| `events/{NNN}.json` · `players/{NNN}.json` · `deck/{NNN}.json` | 11–13 KB | one leaf page (256 buckets) |
| `leaders.json` · `card-names.json` | 1.8 / 26 KB | archetype names · names and prices |
| `tournaments-index.json` · `players-index.json` | 12 / 55 KB | the two directories |
| `tournaments-archive.json` · `players-archive.json` | 128 / 215 KB | only on "include the rest" |
| `matchups/{leaderId}.json` | 1–31 KB | one archetype's pairings |

**The archive is a file per month**, because a window is a date range and selects its
months by arithmetic (`archiveMonthsFor()` in `lib/meta.ts`, tested against a fixture with
months deliberately missing — a payload that is not there is answered on a static host
with the whole of `404.html`, as JSON, which fails to parse).

Two things were tried and are worth not repeating: **interning** repeated event and player
names made the file *larger* (gzip already collapses that), and shipping the whole English
corpus cost 324 KB for a page most people open to ask about last month.

---

## Gotchas

**Control characters in regexes.** A `\b` written through a patch became a literal `0x08`
four times, and once worse: inside a **template literal** `\b` *is* the backspace
character, so a regex built as `` new RegExp(`\b(?:${COLOURS.join('|')})\b`) `` compiled
and matched nothing — and `npm run check` cannot see that one. **Build a regex out of a
variable by concatenating plain strings.** Invisible in an editor and in a diff.

**A test that writes where the site keeps its files will delete them.** The Discord ingest
prunes thumbnails no card points at, and a fixture corpus points at none — so `npm test`
removed every real thumbnail in `public/spoilers`, and because `verify` runs *before*
`build:static`, the deploy shipped a site whose images its own test suite had deleted. The
script takes `--out` and `--thumbs`; one test asserts `public/spoilers` is untouched.

**One writer per payload.** `ingest-topdecks.mjs` and `ingest-decks.mjs` both used to write
`public/data` files that `build-indexes.mjs` rewrote or deleted seconds later — visible only
when build-indexes did not get that far, leaving a 0 KB index. `ingest-decks` also spent
every run on an adoption scan whose output was discarded, and its copy had already drifted
from the live one (`total < 30` against `total < 40`).

**Rate limit.** Limitless advertises `RateLimit: "50-in-5min"`. The limiter lives in
`scripts/limitless.mjs` because two ingests use it, and two copies would be two limiters
against one server. `update-matchups` runs three hours after `update-decks`.

**A refusal is not a breakage.** `scripts/refusal.mjs`: 403/429/503 and a connection that
never completed are the upstream's decision — warn and exit 0. A parse that broke is ours
and exits 1. Backoff is in *seconds* (3, 10, 30). **Up to a point:** past
`STALE_AFTER_HOURS` (72) a refusal goes red, because `update-spoilers` once spent five days
green while writing nothing.

**A refusal can wear a successful answer.** onepiecetopdecks.com once served forty pages to
a runner as clean 200s yielding **zero decks**, and both corpora were written away to
nothing. `scripts/corpus-guard.mjs` refuses an empty answer over a non-empty corpus, and any
run returning less than half of what is recorded. An index page with no links on it is the
same refusal one page earlier. `--limit N` reads without writing, because a spot check looks
exactly like a collapse.

**`decks-merged.json` carries no card lists.** It is imported by `lib/decks.ts`, so
`resolveJsonModule` infers a literal type for every key — fine at 26 MB and fatal at 83,
where `tsc --noEmit` dies with *Ineffective mark-compacts near heap limit*.

**The deck corpus is a file per year, and used to be one 66 MB file.** GitHub warned
on every push at 50 MB; the **hard limit is 100 MB and a push over it is rejected
outright**, which is the day the archive stops updating rather than a day it looks
untidy. At 1.61 MB a month the single file reached it in about 21 months.

A year makes the problem stop rather than move: a closed year never grows again, and
the current one gains ~19 MB before it closes. The largest, 2024, is 32.7 MB.
`scripts/deck-corpus.mjs` owns the layout because three scripts touch the corpus —
`ingest-decks` writes it and reads it back as its own cache, `build-indexes` merges
it, `ingest-matchups` joins against it.

`readDecks` reads the legacy `decks.json` **as well as** the years, so a checkout
that has not re-ingested is not read as an empty archive — which would have
`build-indexes` write empty payloads over live ones. The first write removes it.
Rows are sorted within a year by date then id, so two runs produce identical bytes:
`substantive-change.mjs` decides whether to commit by diffing, and an unstable order
would rebuild the whole site to reshuffle a file. A year that empties loses its file,
or `readDecks` keeps returning rows nothing wrote.

The migration was verified before the old file was deleted: 58,399 rows in and out,
identical ids and identical bodies by hash. The derived payloads changed order only —
same set of decks, zero rows with different content.

`data/decks-merged.json` is the next one to watch at 30.9 MB. It is derived, so
losing it costs a rebuild rather than an archive.

**`decks-state.json` holds `details`.** That map is the only copy of each event's venue. An
earlier "slimming" dropped it and a rebuild reclassified 275 tournaments as `unknown`.

**Discovery stops where the archive already reaches.** The listing is read newest first and
the loop breaks at the first fully-seen page, which is right for keeping up and made a
backfill impossible. `--backfill` pages to the cutoff instead.

**Bandai's event pages are server-rendered**, and the events are far down the same HTML.
The layout varies (`<h5>` on one page, `<h4>` on another; fields bare, in `<div>`, or
wrapped in `<strong>`), the real name is often not the heading, and their text carries
zero-width characters — `decode()` strips U+200B/C/D, U+FEFF and U+00A0, **written as
escapes rather than literals**. Registration dates are published as a *guideline*, and that
caveat travels with the data.

**A Discord channel needs a bot** — automating a user account is against Discord's terms —
with the **Message Content** privileged intent, without which `content`, `embeds` and
`attachments` all come back empty. **A forward is empty at the top level**: the real message
is in `message_snapshots[].message`. A reveal post is `Name Colour Type Rarity`, and the
colour is the hinge. Discord's attachment URLs are signed and expire in hours, so a link
saved into static JSON is dead within the day.

**A new ingest workflow needs three things**: the schedule, the right `git add` paths
(**always `data public/data`**, and `public/spoilers` where it applies), and a line in
`publish-site.yml`'s `workflows:` list — or its commits are never deployed.

**Commit only when something substantive changed**, which is
`node scripts/substantive-change.mjs`. Naming the files that lack a timestamp does not
work: `spoilers.json`, `banlist.json`, `regions.json` and `meta.json` all carry
`generatedAt`, so three workflows committed on *every* run and each rebuilt the whole site.

**A failing step and a stopped pipeline are different decisions.** `update-decks` reads
submissions after spending thirty minutes of request budget, so that step is
`continue-on-error` **and** checked in a final step that fails the job.

**Windows and WSL share one `node_modules`.** Native modules ship one platform's binary;
`wrangler` and `sharp` both fail with "you installed X on another platform". Both platforms'
binaries are present, with the other's in `optionalDependencies`.

**What a test can reach decides where code lives.** Node resolves neither extensionless
relative imports nor the `@/…` aliases, so anything a test needs must be free of imports —
which `deck-rules.ts`, `meta.ts`, `prices.ts`, `deck-stats.ts` and `directory.ts` are, and
why the directory fetches sit in `shards.ts`. Tests are TypeScript run straight through
`node --test` (Node strips the types from 22.18, which CI pins) and the glob must be
quoted: a bare directory argument makes Node load `tests` as a module.

**A script's own guards need a test that runs the script.** `--fixture` evaluates neither
`CONFIGURED` nor `fromSupabase`; `node --check` parses and sees nothing; `tsc` does not read
`.mjs`. `tests/ingest-submissions.test.ts` spawns it and reads the exit code.

**`basePath` applies to every build, including `npm run dev`.** It used to apply only to the
export while `NEXT_PUBLIC_BASE_PATH` was set for everyone, so every payload 404ed locally.

**A new top-level route needs a line in `sitemap.ts`**, and nothing enforces it. Six pages
have been missed that way.

---

## Sources, and what they allow

| Source | Role | Access |
| --- | --- | --- |
| [Punk Records](https://github.com/buhbbl/punk-records) | Cards — every printing, typed | Static JSON |
| [Vegapull Records](https://github.com/Coko7/vegapull-records) | Rules text in bulk | Static JSON |
| [OPTCG API](https://optcgapi.com/) | Prices, set names | Public REST |
| [Limitless](https://onepiece.limitlesstcg.com) | Tournaments, decklists, **pairings** | Documented API, no key |
| [Top Decks](https://onepiecetopdecks.com) | JP/EN archives, leaks | WordPress API |
| [Bandai rules](https://en.onepiece-cardgame.com/rules/) | Banlist, block updates | HTML, no API |
| [Bandai events](https://en.onepiece-cardgame.com/events/) | Regionals, Finals, Cups | HTML, no API |
| Discord | Card reveals, minutes after they leak | Bot token, private channel |
| Organizers | Submitted tournaments, after review | Supabase |

**Do not point card images at anyone else's CDN.** Bandai's blocks browser embedding; the
optcgapi mirror has ~83% coverage and would be their bandwidth at 348 KB a card.

**Do not integrate onepiece.gg.** Its `robots.txt` names AI crawlers as disallowed and its
pages 403 non-browser clients. An explicit opt-out: link to it, never fetch it. Same for
**mtggoldfish.com**, which disallows `ClaudeBot` outright. **optcg.one** disallows `/api/`.

Top Decks card scans are referenced with attribution, not copied. Pre-release art is not
ours to re-host.

---

## Scheduled jobs

`update-cards` (daily, gated on `ingest.mjs --check`, which exits 3 when current),
`refresh-prices` (2×/day), `update-decks` (07:20 and 19:20 UTC), `update-matchups` (daily
at 10:20 UTC, three hours after the morning deck ingest), `update-rules` (8h),
`update-spoilers` (6h), `update-discord` (2h — the fast spoiler source, and it rebuilds
`spoilers.json` in the same run), `update-events` (daily at 10:00 UTC). Then `publish-site`.

**Cron has no timezone.** 07:20 UTC is 09:20 in Italy on summer time, and GitHub delays
scheduled runs — four hours is normal on a busy day, and a run can be dropped entirely.

`check` runs `npm run verify` on every push to `prod` or `dev` and on every pull request.
`publish-site` runs on push to `prod` **and** on `workflow_run`, because a commit made with
`GITHUB_TOKEN` does not trigger another workflow. It compares the tip of `prod` against
`out/.source` on the deployed branch and stops when they match.

**Let CI do the deploying.** The build is deterministic for a given Node version but not
across them: CI pins 22, and building the same commit on 26 produced five different chunks.

---

## Current shape

2,785 cards · 4,843 printings · 60 sets · 2,172 Standard-legal, 20 via the block exception ·
2,770 priced · 69,920 decklists — English 63,983 from 2022-10, Japanese 5,937 from 2022-07 ·
7,936 tournaments · 19,546 named players, 3,677 with five or more results · 152,890 recorded
matches from 1,025 brackets · 44/46 release windows · 67 announced official events · 230
tests.

These drift daily and are a snapshot, not an invariant.

---

## Still to do

**Email and password sign-in** waits on a custom SMTP provider — an account to open, not a
code change. The form is on the account page, disabled, carrying that to-do where it can be
seen. Flip `NEXT_PUBLIC_AUTH_EMAIL=1` once the provider is set. Deferred until there is a
real domain, since the sender address wants one.

**Deliberately absent, so nobody adds them by reflex.** No analytics and no cookie banner:
`document.cookie` is empty, the only browser storage is `poneglyph:notice:1` and Supabase's
session, and `/privacy` and `/legal` both promise in writing that nothing is collected —
installing any analytics makes two published pages false. No sticky mobile call to action
either: the two on the home page are above the fold at 375×812, measured, and a bar that
follows a reader down a card list is a conversion pattern on a site with nothing to convert.
