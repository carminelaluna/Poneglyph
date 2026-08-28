# Poneglyph — working notes

Unofficial ONE PIECE CARD GAME archive and metagame tracker. Next.js 16 (App
Router), TypeScript, no database — ingest scripts write JSON, the site is built from
it, and accounts are the one exception (Supabase, for saved decks and organizer
submissions).

**Every page carries a Bandai disclaimer. Do not remove it, and do not add anything
that implies official standing.** `/legal` is the notice, `/privacy` and `/terms` are
the two URLs the OAuth providers require.

**Caveats live on the page that exists for them, not on every page.** Ten pages each
carried a dashed red callout, which made the treatment reserved for "look at this"
the thing a reader met almost everywhere. How the archive is built — sampling, decks
against entrants, spellings never merged, what a matchup is — is on `/data` under
*How to read the numbers*; what this site is and is not is on `/legal`; accounts are
on `/privacy` and `/terms`. A browse page keeps at most one line of provenance
(`.source-line`) and a link. The exception is `MetaBrowser`, whose two warnings are
conditional: they describe the table in front of you right now, so they stay, as a
line rather than a box.

Moving to a domain, another CDN, or a real machine: **[MIGRATIONS.md](MIGRATIONS.md)**.

---

## Commands

| | |
| --- | --- |
| `npm run dev` | Dev server, port 4321 — **under `NEXT_PUBLIC_BASE_PATH`** |
| `npm run build` | Server build, ~4,700 pages |
| `npm run verify` | `check` + `typecheck` + `test` — what CI runs on every push |
| `npm run check` | Control characters, reserved SQL column names, recursive policies |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | `node --test` over `tests/*.test.ts` |
| `npm run ingest` | Cards, and a price point (runs `check` first) |
| `npm run ingest:decks` | Limitless tournaments, budgeted and resumable |
| `npm run ingest:matchups` | Limitless pairings — one request per tournament |
| `npm run ingest:topdecks` | Top Decks archives, both regions |
| `npm run ingest:spoilers` | Unreleased sets |
| `npm run ingest:banlist` | Banned & restricted list |
| `npm run ingest:events` | Official events from Bandai |
| `npm run ingest:submissions` | Approved organizer tournaments — needs the service key |
| `npm run build:indexes` | **Run after any deck ingest** — derives everything |
| `npm run ingest:images` | Mirror card art into `public/cards` |
| `npm run build:cdn` | That mirror to WebP at 3 widths, into `cdn/` |
| `npm run build:cdn:lock` | Same, plus a referrer check — **read the cost first** |
| `npm run deploy:cdn` | Upload `cdn/` to Cloudflare Pages |
| `npm run build:static` | `out/` for GitHub Pages — needs `NEXT_PUBLIC_CDN_URL` |
| `npm run serve:static` | Serve `out/` on 4322 **the way Pages does** |
| `npm run deploy:site` | Push `out/` to `main-selfhost` |

`build:indexes` is not optional plumbing: it merges the corpora, deduplicates,
derives release eras, shards the matchups, and writes both the browser payloads and
`data/decks-merged.json`. A deck or matchup ingest without it leaves the site on
stale data.

The four modules above the ingests are pure and imported rather than inlined, and
both properties are load-bearing: shared so two copies cannot drift, pure so a test
can run them. Every one of them is a place where a number is decided.

---

## Pipeline

```
sources.mjs          every upstream, with its role and limits
limitless.mjs        the rate limiter and request helper, shared by two ingests
matchups.mjs         a bracket -> results, and the flip that stores both sides
price-history.mjs    the append and the ninety-day trim, both pure
submissions.mjs      an organizer's answer -> corpus rows
ingest.mjs           cards     -> data/cards|sets|filters|meta.json + cards-index
                                 + data/price-history.json (one point per change)
ingest-decks.mjs     Limitless -> data/decks|tournaments|decks-state.json
ingest-matchups.mjs  Limitless -> data/matchups.json (pairings, resumable)
ingest-topdecks.mjs  Top Decks -> data/decks-{en,jp}.json
ingest-spoilers.mjs  leaks     -> data/spoilers.json
ingest-banlist.mjs   Bandai    -> data/banlist.json (+ numbers-only in public/data)
ingest-events.mjs    Bandai    -> data/events-official.json (+ public/data)
ingest-submissions   Supabase  -> data/decks-community.json (approved only)
build-indexes.mjs    all       -> public/data/decks-{en,jp}-{index,archive}.json,
                                 public/data/decks-{en,jp}/*.json,
                                 public/data/{events,players,deck}/*.json (64 each),
                                 public/data/{tournaments,players}-{index,archive}.json,
                                 public/data/matchups/{leaderId}.json,
                                 public/data/{leaders,card-names}.json,
                                 data/decks-merged.json, data/regions.json
build-static.mjs     the app   -> out/
deploy-site.mjs      out/      -> main-selfhost
```

`data/*.json` is imported at build time; `public/data/*.json` is fetched by the
browser. **Never import a `public/data` file into a component** — it exists precisely
to stay out of the bundle.

---

## Invariants

Load-bearing. Breaking one produces plausible-looking wrong numbers.

**Cards vs printings.** A card is the gameplay entity; `OP01-025`, `_p1`, `_p2` are
printings of it. Search returns 2,785 cards, not 4,843 printings. The UI writes
`OP01-025`, `V2`, `V3` — the `_pN` suffix is an image filename, not something on the
card.

**Sampling is per deck, not per corpus.** Limitless publishes whole Swiss fields; Top
Decks publishes only decks that placed; organizers say which they are uploading. Each
row carries `f: 1|0`. *Share* counts every deck; *win rate* counts only `f === 1` and
shows its sample (`52.8% /195`). A win rate over winners-only data reads near 100% and
means nothing.

**A matchup is not a win rate, and they are counted from different things.** The
win rate on an archetype page is its record against *the field*. The matchup table
is its record against a **named** opponent, and it exists only because Limitless
publishes `/tournaments/{id}/pairings` — round, table, both usernames, the winner.
`ingest-matchups.mjs` joins that against the Leader each username played *at that
tournament*. Nothing is inferred from standings. It follows that matchups cover
**Limitless events only**: Top Decks publishes finishing lists and organizers are
not asked for brackets, so the table says whose events it is drawn from — and shows
nothing at all under the Japanese view, because Limitless is an English-corpus
source and an English table under a Japanese heading would be real matches about a
different metagame. Mirrors
are dropped (a deck beats itself half the time) and rows under five games are held
behind a click — 67% from three games is noise wearing a percentage. A bye has no
opponent and is dropped with the matches whose other side never submitted a list:
the missing archetype is genuinely unknown, and inventing one would put matches on a
deck that never sat at that table.

**Each match is stored twice, once from each side**, which is 12 bytes against every
reader flipping it themselves and one of them getting it backwards. `flip()` lives in
`scripts/matchups.mjs` and is used by the writer; `tests/matchups.test.ts` reads the
built payloads back and asserts that every pair agrees — 3,770 ordered pairs, and if
two ever disagreed the site would report a matchup and its opposite as both winning.

**Prices are a series now, and it is sparse in both directions.**
`data/price-history.json` keeps ninety days. `prices[cardId]` holds one entry per
*change*, so reading a day means the last point at or before it — and `days` holds
the days something moved **on**, not the days the ingest ran. The second half is not
symmetry for its own sake: the ingest runs three times a day and the file is
committed by a scheduled job, so appending a date on a quiet day would rewrite it,
and a rewritten file is a commit, a rebuild and a deploy of 24,000 files to publish
one longer flat line. That is the failure `substantive-change.mjs` already exists to
prevent, and the first version of this shipped with it.

The consequence for the reader is that the gaps are uneven, so `sparkline()` places
points **by date rather than by index**: a fortnight of stillness and an overnight
jump drawn the same width is the one thing a price chart is read to tell apart. The
card page prints the number of recorded changes and the days they span as two
separate figures, because three points across sixty days is a price that sat still.

Nothing is back-filled — the source publishes a price and a scrape date, not a
history — so a card the ingest has seen once says so instead of drawing a flat line
that would read as a steady price.

**Regions are separate corpora, not a filter.** English and Japanese have different
card pools and event structures. Switching region swaps the dataset.

**English is deduplicated.** 223 lists appear in both English sources. A duplicate is
same day + player + Leader + *the same fifty cards*. The looser key matched 242, but
19 had different lists and a player can bring one archetype to two events in a day.
Limitless wins the tie; community submissions lose it, because an automated source can
be re-checked.

**Windows are measured from the newest deck on record, not from today.** Results
arrive in batches; anchoring on the clock would silently empty "last 7 days" whenever
ingestion paused.

**Release eras are derived, never hardcoded.** A date is claimed only when a set first
appears after the corpus starts, reaches ≥10% of decks in a 7-day stretch, *and* brings
≥3 distinct cards. All three matter: ST-01 shipped in 2022, but one of its cards
entered play mid-corpus and hit 17% — a deckbuilding trend, not a release. The date is
when a set entered *competitive play*, not its paper release (OP-17: played 2026-08-17,
printed 2026-08-28).

`data/regions.json` also carries **`releases`** — those eras flattened across both
regions, newest first, earliest date per set. The home page reads it for the six most
recent Leaders. It used to take the last match per colour out of `cards`, which is
ordered by card number rather than by release, so it showed three different
Monkey.D.Luffy from starter decks. Still play dates, so nothing on the page claims a
release date.

**Standard legality has a published exception.** Standard is Block ≥ 2
(`STANDARD_MIN_BLOCK`), but Bandai keeps 20 Block 1 cards legal and
[lists them](https://en.onepiece-cardgame.com/rules/blockicon-card/). Read that page;
do not infer. Upstream reports block 1 for every printing including reprints, and "has
an alternate art" is not the rule.

**Missing values are named, not blanked.** `Not recorded` for absent players, events,
records and field sizes. A blank reads as a bug; a `0` field size reads as "nobody
came". `NA` is not a player — it is the most common name in the raw data (172 rows) and
would top every leaderboard.

**Card art is fetched once, never hotlinked.** The official CDN sends
`Cross-Origin-Resource-Policy: same-site`, so a browser refuses to render its images
from another origin. `/art/[id]` fetches server-side, where that header does not apply,
and mirrors to `public/cards`.

**Art is served at the width it is rendered.** One 600×838 source appears at 38 px in a
table row and 600 px in the lightbox; sending the original to both made a grid of 60
weigh 18 MB. `art(id, width)` takes 96, 320 or 600; `artSrcSet` offers all three. Both
live in `lib/art.ts` — **not** `lib/cards.ts` — because the client grids need them and
importing from `cards.ts` would drag 4.4 MB of card JSON into the bundle.

With `NEXT_PUBLIC_CDN_URL` unset the proxy answers instead, so a fresh checkout works
with no CDN. `build:static` refuses to run without it — an export has no proxy.

**Never `fetch('/data/…')`.** Next rewrites `<Link>` hrefs and asset URLs under a
`basePath`; it does not touch `fetch`. On a project page that asks the account root for
a file one directory down and gets the 404 page back — as JSON, which fails to parse
and reads like a corrupt payload rather than a wrong URL. Everything goes through
`dataUrl()` in `lib/paths.ts`. Same for hand-written `<img src>`: use `asset()`.

---

## Rendered in the browser, not prerendered

`/event/[id]`, `/player/[slug]` and `/deck/[id]` fetch their own data. Prerendering all
37,000 costs **5.5 GB** against GitHub Pages' 1 GB; shipping a whole region so a page
can find its three rows costs 362 KB gzipped to draw one small event.

So `build-indexes.mjs` groups the corpus by entity into **64 buckets** and a page pulls
the one its id falls in — 11–15 KB. `shardOf` is FNV-1a and exists **twice**, in
`build-indexes.mjs` and `src/lib/shards.ts`; if they drift every lookup misses and every
page reads "not found". Same for `playerSlugOf` against `playerSlug` in `lib/meta.ts` —
note it is *not* the script's `slugify`, which truncates at 48 rather than 64.

**The two directories are whole files, split by interest rather than by hash.**
`/tournaments` and `/players` list what those leaf pages are pages *of* — before
them, 7,163 events and 8,686 players had pages and nothing linked to the set of
them. Rows are positional arrays (`tournaments-index.json`, `players-index.json`),
and the split is the same trick as the metagame index: the last ninety days of
events (11 KB) and everyone with two or more results (45 KB) up front, the rest
behind one deliberate click. The positions are written in `writeDirectories` and
read in `lib/directory.ts`; `tests/parity.test.ts` checks a built payload back
through the readers, because a column inserted on one side renders a venue where a
tier should be and looks like a styling bug.

The prerender lists stay: an event with a real field, a regular, a notable finish. What
they buy is a 200 and a title written from the data. **Everything else is reached
through `404.html`**, which reads `location.pathname` and renders the same view — a real
HTTP 404 under a correct page, which is the trade for not spending the 5.5 GB. Those
pages carry no search value; the Regionals do, and they are prerendered.

---

## Deck builder

`/deckbuilder` builds a deck in the page from the same 176 KB card index search already
downloads. Rules live in `lib/deck-rules.ts`, free of imports so they run the same in
the builder, the submission form and a test.

**Nothing persists unless it is saved.** Reloading starts empty, on purpose: an earlier
version kept the deck in the address bar and localStorage, which made "start over" the
awkward operation and greeted people with a deck they had abandoned. `?deck=<id>` opens
a *saved* deck — reloading that reopens the saved version and discards unsaved edits,
which is what starting over means once a deck has somewhere to live.

**What the fifty cards add up to is arithmetic on what is already downloaded.** The
cost curve, the average cost, the counter total and the deck's price all come out of
the same 176 KB card index the search uses, so the panel costs no request. The price
is the **lowest listed**, summed over every copy including the Leader, and it names
how many copies it could not price — about one card in twenty has no figure, and a
total that folded those in as zero would read as a cheaper deck rather than as an
incomplete one. The decklist pages get the same total from `card-names.json`, which
gained a third element for it (+4 KB gzipped, against 176 KB to reuse the index).

**Export is one button and one format**: `{count}x{cardId}`, one per line, Leader first
— what OPTCGSim's *Import from clipboard* reads. The dialog that used to be here offered
four formats and a download; three were choices to read past on the way to the one with
a destination.

**Import is a textarea, not a clipboard read.** `navigator.clipboard.readText()` needs a
secure context and a permission Firefox does not grant to pages, so a button that only
did that would be dead for a share of readers with no way to tell. The clipboard
prefills the box where it is allowed. `DeckExport` has an `execCommand` fallback for the
same reason; a programmatic click fails both and that is a test artefact, not a bug.

**Imported counts are not clamped.** A pasted list with six copies keeps six and the
validator says so — trimming to four on the way in would hide precisely what the reader
needs to see. Cards the archive does not have are dropped *and named*.

**The banlist covers the Leader, and once did not.** Two of the five banned cards are
Leaders, and the banned *pairs* include Leader `OP11-040`, which may not be played
alongside Charlotte Katakuri or Charlotte Linlin. `validate()` compared the banlist only
against the fifty, so a banned Leader reported "Legal in Standard". The `held` set now
starts with the Leader's id.

**The colour rule is a warning, not an error.** Every colour on a card has to be a colour
on its Leader — checked against 63,155 card-and-leader pairs from recorded decks, with
not one exception. (Four rows appear to break it and all come from a single decklist
whose data is wrong: that Leader is mono-Purple in its other 63 decks.) It stays a
warning because `P-117 Nami` carries a deckbuilding clause in its own text and a future
Leader can too. Refusing the card would be confidently wrong; flagging it is only noisy.

Errors are what the rules state and this data can check — fifty cards, four copies of a
card number, the banned list, rotation. `ingest-banlist.mjs` writes a numbers-only copy
to `public/data/banlist.json` for that; the `/banlist` page imports the build-time file.

---

## Accounts and submissions

`supabase/schema.sql` is the whole thing; run it once on a new project. A **user** saves
decks only they can see. An **organizer** can also submit a tournament, which after
review joins the metagame corpus.

**No client can mint an admin, and that is the line the whole model rests on.**
There are three roles — `user`, `organizer`, `admin`. Nothing lets an account change
its own `role` or a submission's `status`. The update policy on `profiles` re-reads the
stored role in its `with check`, because `using (auth.uid() = id)` alone would let
anyone promote themselves with one PATCH. That is the entire security model: every
number here is derived from recorded results, so an account that could add a
tournament unreviewed could put anything into them.

**Reviewing happens on `/review`, and the gate did not move.** Approving used to mean
opening the Supabase table editor and changing a cell — fine for the first few, and
poor immediately after, since the decklists are JSON in a column and the fifty cards
are the one thing a reviewer has to actually read. `admin` is what the two new
policies check, it is still granted by hand, and it is still checked against the
reader's **own** profile row. Rejecting requires a note, and the organizer sees it.

`supabase/` holds `schema.sql`, the whole thing for a new project, and `migrations/`,
the same changes for one that already exists, **numbered in the order they must
run**. All are safe to run twice. They were dated at first, until two landed on one
day and the order they sorted in stopped being the order they had to run in.

**No policy may read the table it is on.** Postgres has to evaluate the policy to
decide whether the policy applies, and refuses — `infinite recursion detected in
policy for relation "profiles"` — and since SELECT policies are OR'd, one of these
breaks *every* read of that table, and with it every policy elsewhere that asks it a
question. The symptom therefore surfaces a long way from the cause: this shipped
once, and what it took down was renaming yourself. Roles are asked through
`public.has_role()` and `public.my_role()`, `security definer` functions that run as
the table's owner and so do not re-enter its policies; neither takes a user id, so
neither can be used to probe another account. `npm run check` refuses the shape now.

Both are executable by **`anon` as well as `authenticated`**, which reads as too
generous and is not. Policies are OR'd, so a signed-out read evaluates the admin
policy too; revoked from `anon`, that answers `42501 permission denied for function
has_role` instead of an empty list, and row-level security is meant to say "nothing
here" rather than to error. Since neither function takes a user id — both ask about
`auth.uid()`, null for an anonymous caller — the grant discloses nothing.

**Asking for the organizer role is a row, not an email.** The site used to answer
"how do I submit results" with the contact address on `/legal` — off the record, easy
to lose, visible to nobody but whoever received it. A plain account now asks from its
account page (who they are, what they run, somewhere it can be checked) and `/review`
answers. One open request per account, enforced by a partial unique index rather than
by the form.

**Once sent, it stands.** No update policy for the sender and no delete either: a
request that could be rewritten, or taken back and replaced, after a reviewer had
read it is a request nobody can rely on having read. The way out of a mistaken one
is a refusal, which carries a note and allows another. Collapsed, the whole feature
is one button whose label is the status; a **tournament submission** is a different
case and can still be withdrawn while pending, because that is the organizer's own
work rather than a decision someone else has already read.

Approving is **the one place a role changes outside the dashboard**, and the policy is
the narrowest rule that does it: `using` requires the target row to be a `user` or an
`organizer`, so an admin's row is unreachable through it, and `with check` requires the
new value to be one of those two, so no client can produce an admin however it is
called. An admin can also *read* those rows — not to browse them, but because
**PostgREST does not treat an RLS-filtered update as an error**: it affects nothing and
returns cleanly. Without reading the row back, "Grant the role" would report success
every time that policy was missing. Both review writes now assert they changed a row
and name the migration when they did not.

**An organizer can see what happened to what they sent.** `/submit` lists their own
submissions with status and the reviewer's note, and lets them withdraw one that is
still pending — all through the `read own submissions` policy, which had been in the
schema from the first version with nothing ever calling it. The form was write-only
until then: you sent a tournament and the site never mentioned it again.

**Submissions do not reach the site directly.** `ingest-submissions.mjs` reads only rows
marked `approved`; `build-indexes.mjs` folds them in as a **third corpus**,
`source: 'community'`, carrying the organizer's own answer about field versus winners.
`--fixture <file>` reads a local JSON instead of Supabase, which is how the mapping and
the merge were tested before any database existed.

**`SUPABASE_SERVICE_ROLE_KEY` bypasses every policy.** Workflow secrets only — never in
`.env.local`, never under a `NEXT_PUBLIC_` name, since anything with that prefix is
compiled into the browser bundle. The anon key ships in that bundle by design, and it is
safe to because the policies stand behind it.

**Sign-in is OAuth first, and that is a constraint rather than a preference.** Supabase's
built-in mail sends **two messages an hour** to pre-authorized addresses and is documented
as non-production. Discord and Google send no mail at all. Email and password needs
confirmation and reset mail, so the form is hidden behind `NEXT_PUBLIC_AUTH_EMAIL=1` until
a custom SMTP provider exists: an account whose password cannot be reset is a trap, not a
feature. (Resend's free tier is 3,000 a month, 100 a day.)

The token comes back in the URL **fragment**, which browsers never send to a server —
that is what makes this work on GitHub Pages with nothing behind it. Every value
`authRedirectTo()` can produce must be in Supabase's redirect allowlist, **with the
trailing slash**, and it is built from `location.origin` so localhost and the live site
both work.

`lib/supabase.ts` is imported **only** by pages under `/account` and `/submit`: the
library is ~100 KB against a site measured in tens, and importing it from a shared
component would put it on every page. Measured, it reaches 2 chunks out of 16.
`accountsEnabled` is false on a checkout with no project, and the account page and the
nav entry both check it — the site was useful before accounts and has to stay that way.

**Decklists are pasted, not built.** The submission form takes the same format the site
exports; `parseDeckList` is the inverse of `DeckExport`. Nobody with a 32-player event
will click fifty cards thirty-two times. The parser is tolerant of the four shapes that
turn up in the wild and strips the `_pN` suffix — two entries for one playset would each
look under the copy limit. **The form checks and refuses nothing**: review is the gate,
and rejecting a real result because our archive is behind would be strict in the wrong
direction.

**Still to do:** email and password sign-in stays hidden until a custom SMTP provider
is configured — that is an account, not a code change, and everything else about it is
already written.

---

## One repository, two branches

[carminelaluna/Poneglyph](https://github.com/carminelaluna/Poneglyph), public — which is
what makes Actions unmetered and Pages free.

**`main-node`** holds the code, the ingests and the data. It is the default branch and
the only history that matters. **`main-selfhost`** holds `out/` and nothing else, an
orphan branch rebuilt from scratch each deploy: fresh `git init`, one commit, force push.
That is safe precisely because nothing on it was ever authored. Roll back by checking out
an older commit on `main-node` and building again.

The force push is aimed at a branch name, so `deploy-site.mjs` refuses `main-node`, `main`
and `master` outright — pointing it at the source would delete the project.

```
PONEGLYPH_SITE_REMOTE=https://github.com/carminelaluna/Poneglyph.git
PONEGLYPH_SITE_BRANCH=main-selfhost
NEXT_PUBLIC_BASE_PATH=/Poneglyph       # project page; empty for a user page or domain
```

**Never `shell: true` when spawning git.** Node concatenates the arguments and hands the
string to cmd.exe unescaped, so `--message "Site build 2026-08-25T…"` arrived as three
pathspecs. `deploy-site.mjs` also sets `core.autocrlf=false` on the generated repo: Pages
serves what it checks out, and CRLF conversion would alter the RSC payloads and JSON byte
for byte on the way to the browser.

**Pages rebuilds can take a long time.** 24,000 files and 500 MB is a lot for a legacy
Pages build; it has sat `queued` for over an hour. The branch having the new chunk while
the site still serves the old HTML is that, not a broken deploy — check
`gh api repos/…/pages --jq .status` before assuming anything is wrong, and do not pile on
more deploys.

---

## The static build

`npm run build:static` is not `npm run build` with a flag. Five things must be true that
are not true of the server build, and each was found by a deploy failing.

**`/art/[id]` cannot exist.** `output: 'export'` refuses to build while any route handler
does — nothing can run it. `build-static.mjs` moves it to `.art-route-parked` *outside*
`src/app` and puts it back in a `finally`. Parking it in place does not work: everything
under the app directory is a route, dot-prefixed or not.

**`.next` must be deleted first.** Next caches a type validator naming every route it has
seen; a cache from a normal build still names the art proxy, and the export then fails
typechecking on a file that was just moved — reported as a broken import in a generated
file.

**`.nojekyll` must be in `out/`.** Jekyll skips anything whose name starts with an
underscore, and Next puts the whole application in `_next/`. Without it the deploy
succeeds and the site is unstyled and inert. `CNAME` is written from `PONEGLYPH_CNAME`
for the same reason — one added through the Pages settings screen lives in the branch
that the next deploy replaces.

**Prefetch payloads need flattening.** The router asks for
`/decks/__next.decks.__PAGE__.txt`; the export writes `out/decks/__next.decks/__PAGE__.txt`.
Segments are joined with dots in the URL and slashes on disk, so every prefetch misses —
and on a static host a miss is answered with the full 40 KB `404.html`. Fifteen links is
half a megabyte of error pages. The build moves each payload to the flat name.

**The build id must be derived, not random.** Next generates a random `BUILD_ID` per build
and writes it into every page and RSC payload — 4,735 files. Two builds of *identical
data* differed in 23,667 of 24,196 files, so each deploy force-pushed 466 MB of new git
objects. `generateBuildId` in `next.config.mjs` hashes `data/` instead: two builds of the
same data are byte-identical, measured. Do not replace it with a timestamp or a random
value. This was not the bundler — webpack moved the same 23,667 files — though webpack is
kept because its chunk names are content addressed.

`out/cards` holds both the card pages and the mirrored PNGs — `/cards/OP01-025.png` beside
`/cards/op01-025/`. The build strips the images only; removing the directory takes the
archive with it.

`serve:static` is the only way to test this locally. `npm run start` runs the Next server,
which resolves routes itself and will happily render a page the export never wrote. It
reads `NEXT_PUBLIC_BASE_PATH` and mounts `out/` under it — serving at the root answers
every asset with `404.html` and fails differently from production, which proves nothing.

---

## Card art and the CDN

| | |
| --- | --- |
| Source | 4,843 PNG · 1.66 GB · 348 KB average |
| Bundle | 14,529 WebP · ~700 MB · 96 / 320 / 600 px |
| A grid tile | 348 KB → **30 KB** |
| A grid page | 18 MB → **~1.5 MB** |

Cloudflare Pages, assets-only. Not R2: without a custom domain R2 serves from `r2.dev`,
which Cloudflare rate-limits, calls development-only, and — decisively — does not put
behind its cache. The binding constraint is **20,000 files per deployment** on the free
plan; `build-cdn.mjs` refuses to run past it rather than failing at upload. `_headers`
sets a one-year immutable cache, which is the thing GitHub Pages cannot do.

**Restricting the bundle to the site costs the free tier.** `_headers` names the site in
`Access-Control-Allow-Origin` and adds `X-Robots-Tag: noindex`. Neither stops hotlinking —
an `<img>` makes no CORS request — but both are free. Actually refusing foreign requests
needs per-request logic, and Cloudflare bills it plainly: *"requests to static assets are
free and unlimited. A request is considered static when it does not invoke Functions."*
Root middleware matches every path, so `build:cdn:lock` means **no request is static any
more** — all count against 100,000 Functions requests a day, roughly 1,600 grid views.
Weigh that against what it buys: `Referer` is chosen by the client. Plain `build:cdn`
removes the middleware again, so the switch turns off as well as on.

`wrangler` is a devDependency, not `npx`. The deploy passes `--branch poneglyph-art`
because that is the project's production branch: this folder is not a git repo, so
without it the upload lands as a *preview* on a different hostname.

---

## Payload budget

The metagame page is the heaviest thing on the site. Keep it honest.

| File | gzip | Used by |
| --- | --- | --- |
| `cards-index.json` | 176 KB | card search, deck builder, submission form |
| `decks-en-index.json` | 109 KB | English table, last 90 days |
| `decks-jp-index.json` | 34 KB | Japanese table, last 90 days |
| `decks-{en,jp}-archive.json` | 253 / 135 KB | only for "All" or an old era |
| `decks-{en,jp}/{leaderId}.json` | 6–15 KB | one archetype's card lists |
| `events/{NN}.json` | 11 KB | one event page (64 buckets) |
| `players/{NN}.json` | 13 KB | one player page (64 buckets) |
| `deck/{NN}.json` | 15 KB | one decklist's row (64 buckets) |
| `leaders.json` · `card-names.json` | 1.5 / 23 KB | archetype names · names and prices |
| `tournaments-index.json` | 11 KB | /tournaments, last 90 days |
| `players-index.json` | 45 KB | /players, everyone with 2+ results |
| `tournaments-archive.json` · `players-archive.json` | 106 / 88 KB | only on "include the rest" |
| `matchups/{leaderId}.json` | 1–8 KB | one archetype's pairings |
| `events-official.json` | 3.4 KB | the events page, whole |

Card prices are the one figure that appears in three of these. It is in
`cards-index.json` already (`$`), so the deck builder totals a deck for free; the
decklist and archetype pages get it from `card-names.json` instead, because they
were fetching that anyway and pulling the card index would have cost 176 KB. The
card page reads the *history* at build time and ships it as inline SVG — a payload
would have been the whole file to draw one card's line.

Two things were tried and are worth not repeating: **interning** repeated event and player
names made the file *larger* (gzip already collapses that), and shipping the whole English
corpus cost 324 KB for a page most people open to ask about last month. Splitting by
recency is what worked.

---

## Gotchas

**Control characters in regexes.** A `\b` written through a patch became a literal `0x08`
three separate times. Invisible in an editor and in a diff, the regex compiles, and it
matches nothing — the last one made the block-update list read as empty, twenty legal
cards silently reported as rotated out. `npm run check` fails on this and runs before the
card ingest. When editing a regex through a script, verify with `grep … | cat -A`. Writing
a file through a tool can turn `\u0000` escapes into real control characters; the check
caught itself doing exactly that.

**A policy may not read the table it is on.** Postgres has to evaluate the policy to
decide whether the policy applies, and refuses — `infinite recursion detected in
policy for relation "profiles"`. SELECT policies are OR'd, so one of these breaks
*every* read of that table and every policy elsewhere that asks it a question; the
symptom surfaces a long way from the cause, and here it was a rename failing. Roles
go through `public.has_role()` and `public.my_role()`, `security definer` functions
that run as the owner and so do not re-enter policies. `npm run check` reads every
`create policy` and refuses the shape.

**PLACING is reserved in PostgreSQL.** A bare `placing integer` column will not parse, and
the error points at the column name without saying the word is the problem — it belongs to
`overlay(… placing … from …)`. The column is called `place`, and `ingest-submissions.mjs`
maps it to the corpus field `placing`; quoting it would mean quoting it in every query
forever. `npm run check` now scans `.sql` for reserved column names. `role`, `format` and
`name` are *non*-reserved and fine bare.

**Bandai's event pages are server-rendered.** Written off twice as client-rendered, both
times after reading the first sixty lines and finding only navigation. The events are
further down the same HTML, and there are 67. Check the whole document — and note that
`grep -c` counts *lines*, which on minified HTML is one. Three things about parsing them:

- **The layout varies.** The name is `<h5>` on the Regionals page and `<h4>` on the Mall
  Tour one; fields sit bare with `<br>`, in `<div>`, or wrapped as
  `<strong>Date: </strong>value` — where "everything up to the next tag" is the empty
  string. `lines()` flattens first and reads by label.
- **The real name is often not the heading.** Finals headings are `[Season 1]`, shared by
  three events; the organiser is in a `<strong>` and the region in the preceding `<h4>`. A
  heading identical across every event on a page is dropped — that is how "Event Schedule
  and Tournament Organizer" stopped appearing on all 28 rows. Regions are matched **by
  name**, not by heading level, for the same reason; `regionOf()` falls back to scanning
  the whole address, since some venues end in a hall name or a US zip.
- **Their text carries zero-width characters.** One date ends `2026` + U+200B. `decode()`
  strips U+200B/C/D, U+FEFF and U+00A0, written as escapes rather than literals.

**When registration opens is published, and it is a guideline.** At the foot of the
Regionals, Treasure Cup and Extra Grand Battle pages is an *Application Period* table: one
opening date per event month (`For August Events: May 24, 2026`) and a time per region.
Every one of those dates is a **Sunday** — checked, all five. In the same block Bandai
writes that the date *"may vary by tournament organizer"* and the table is *"a guideline
provided only for reference"*. That caveat travels with the data and is printed on the
page. An event's own note — `*Registration begins 2nd August 9AM(CEST)` — is exact and
wins over the table.

**Rate limit.** Limitless advertises `RateLimit: "50-in-5min"`. The ingests read that
header and pause *before* being refused. Raising `--max` does not make a run faster,
only longer. The limiter lives in `scripts/limitless.mjs` because two ingests now use
it, and two copies would mean two limiters against one server, each unaware of the
other's requests — which is the shape of an accidental ban rather than of a rate
limit. `update-matchups` runs three hours after `update-decks` for the same reason.

**`decks-state.json` holds `details`.** That map is the only copy of each event's venue. An
earlier "slimming" of the loader dropped it and a rebuild reclassified all 275 tournaments
as `unknown`. Re-fetching cost 289 requests.

**A refusal is not a breakage.** onepiecetopdecks.com sits behind a filter that
occasionally answers a datacenter IP with a Cloudflare challenge — an HTML body
under a **200**, so `res.ok` is true and the failure surfaces as
`Unexpected token '<'`. It reddened `update-spoilers` four times in thirty-six hours
while the same host answered `update-rules` fine, minutes apart. Two things follow.
The backoff is in *seconds* (3, 10, 30 across four attempts): the old 0.5s/2s put
every attempt inside one blocked window. And a refusal — HTML where JSON was
promised, or 403/429/503 — logs a `::warning`, writes nothing and exits **0**, since
a schedule that is red every few hours for something outside this repository is a
schedule nobody reads. Everything else still exits 1.

**Ingests refuse to write nonsense.** Too few cards, an empty banlist, a dead spine — each
aborts before overwriting. An empty banlist that looks successful is worse than none. The
submissions ingest is the exception: zero approved submissions is a real answer.

**The mark lives in five files, from one drawing.** `src/app/` holds `favicon.ico`,
`icon.png` and `apple-icon.png`, which Next picks up by filename. `public/brand/` holds
`mark-128.png` for the header and `share-1024.png` for link previews. Source artwork is
outside the repo in `Poneglyph Logo Design/icons`. `metadataBase` reads
`NEXT_PUBLIC_SITE_URL` — it was pinned to a domain not in use, which would have pointed
every link preview at a host that does not serve the image.

**Windows and WSL share one `node_modules`.** The project lives on the Windows filesystem,
so running `npm` from WSL over `/mnt/c` reuses the same install — and native modules ship
one platform's binary. `wrangler` (via `workerd`) and `sharp` both fail with "you installed
X on another platform". Both platforms' binaries are present, with the other platform's in
`optionalDependencies` so a clean install skips what does not apply. If one goes missing:

```bash
npm i -D --force @cloudflare/workerd-linux-64@<matching-workerd-version> @img/sharp-linux-x64 @img/sharp-libvips-linux-x64
```

`--force` is required because npm refuses an os-mismatched package. The
`workerd-linux-64` version must match the `workerd` wrangler pulled in. Uploads are also
markedly faster from Windows than from WSL over `/mnt/c`.

**`basePath` applies to every build, including `npm run dev`.** It used to apply only
to the export, while `NEXT_PUBLIC_BASE_PATH` — the same variable, read by
`lib/paths.ts` — was set in `.env.local` for everyone. So `dataUrl()` asked for
`/Poneglyph/data/cards-index.json` while the dev server answered at the root: every
payload 404ed locally and the card browser, the deck builder and the metagame page
all said the archive had failed to load. The proxy fallback in `lib/art.ts` goes
through `asset()` for the same reason. Dev now serves from the path production
serves from, which is the same argument `serve:static` already made.

**What a test can reach decides where code lives.** Node resolves neither
extensionless relative imports nor the `@/…` aliases, so anything a test needs has
to be free of imports — which is why `deck-rules.ts`, `meta.ts`, `prices.ts`,
`deck-stats.ts` and `directory.ts` are, and why the fetches for the directories sit
in `shards.ts` instead. The same rule pushed four things out of scripts that run on
import: `limitless.mjs` (the rate limiter, shared by two ingests), `price-history.mjs`
(the append and the trim), `matchups.mjs` (a bracket becoming results, and the flip
that writes it from both sides) and `submissions.mjs` (an organizer's answer becoming
corpus rows). Each of those is where a number gets decided, and each was unreachable
by a test until it moved.

**Tests are TypeScript run straight through `node --test`.** No runner, no
transform: Node strips the types itself from 22.18, which is what CI pins. Two
consequences. Node does **not** resolve extensionless relative imports or the
`@/…` and `@data/…` aliases, so a module a test imports has to be free of imports —
which `deck-rules.ts`, `meta.ts`, `prices.ts` and `directory.ts` all are, and it is
why the fetches for the directories live in `shards.ts` instead. And the glob has to
be quoted (`"tests/*.test.ts"`): a bare directory argument makes Node try to load
`tests` as a module and the run fails with `MODULE_NOT_FOUND`. `tsconfig.json` needs
`allowImportingTsExtensions` because those imports name the `.ts` file.

**A script's own guards need a test that runs the script.** Extracting `toDecks`
out of `ingest-submissions.mjs` took `CONFIGURED` and `fromSupabase` with it, and
the extraction was checked with `--fixture` — the one mode that evaluates neither.
`node --check` parses and sees nothing; `tsc` does not read `.mjs`. The scheduled
run found it six hours later, by failing after the deck ingest had already spent
its request budget. `tests/ingest-submissions.test.ts` spawns the script the way CI
does and reads the exit code, which is the only thing that would have caught it.

**The parity tests do not import the build script.** `shardOf` and `playerSlugOf`
exist twice on purpose, so the test lifts the *source text* of each copy and runs
the two against nine thousand real keys. That is the drift the comments warn about,
and it is invisible to a typechecker.

**Dev server port.** 4321, static preview 4322. If `preview_start` reports a port in use,
change it in `.claude/launch.json` *and* `package.json` together.

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
| Organizers | Submitted tournaments, after review | Supabase |

**Do not point card images at anyone else's CDN.** Bandai's blocks browser embedding
outright. The optcgapi mirror does not, but a 24-printing sample found ~83% coverage —
OP-17, promos and many alt arts missing — and it would be their bandwidth for every view,
at 348 KB a card, with no way to resize.

**Do not integrate onepiece.gg.** Its `robots.txt` names `anthropic-ai`, `Claude-Web`,
`GPTBot` and `ChatGPT-User` as disallowed and its pages 403 non-browser clients. An
explicit opt-out: link to it, never fetch it. **optcg.one** disallows `/api/`.
**matchmaking.gg** is a parked domain, not a TCG site.

Top Decks card scans are referenced from their server with attribution, not copied.
Pre-release art is not ours to re-host.

---

## Scheduled jobs

`update-cards` (daily, gated on `ingest.mjs --check`, which exits 3 when current),
`refresh-prices` (2×/day), `update-decks` (2×/day), `update-matchups` (daily at 10:20
UTC, three hours after the morning deck ingest so the tournaments it found already
have decklists to join pairings against), `update-rules` (8h), `update-spoilers` (6h),
`update-events` (daily at 10:00 UTC — noon in Italy on summer time, 11:00 in winter;
cron has no timezone). Then `publish-site`.

`check` is the other one, and it is not a schedule: `npm run verify` on every push to
`main-node` and on every pull request. Before it existed, the first thing to notice a
type error was the production build, and the first thing to notice a rule that had
stopped being true was a reader.

**`publish-site` also runs on `push` now.** `workflow_run` covers commits made by the
ingests; a commit made by a *person* triggers nothing else, so a change to the site
itself used to sit undeployed until a scheduled ingest happened to finish. Markdown
is ignored, since none of it is built into the site.

**Commit only when something substantive changed**, which is
`node scripts/substantive-change.mjs` — stage everything, then ask. Naming the files that
lack a timestamp does not work and had already failed twice: `spoilers.json`,
`banlist.json`, `regions.json` and `meta.json` all carry `generatedAt` and `durationMs`, so
three workflows committed on *every* run and each commit rebuilt and redeployed the whole
site to publish a new timestamp.

**A failing step and a stopped pipeline are different decisions.** `update-decks`
reads approved submissions after spending thirty minutes of Limitless request
budget, so a hard stop there commits none of the decklists it just fetched and
freezes the whole archive over a subsystem that may hold no rows at all. The step
is therefore `continue-on-error` **and** checked in a final step that fails the job.
The original arrangement had the first half without the second, which is how a URL
read from a secret that did not exist ran red for a day under a green tick: what was
missing was not the failing, it was the looking.

**Always `git add data public/data`.** Two workflows did not — one staged only `data/`, the
other named individual files, a list that went stale the moment the per-entity shards
appeared. Both run `build-indexes.mjs`, which writes every payload the browser fetches into
`public/data`, so the archive refreshed and the site kept serving the previous ingest.
Nothing fails when a payload is missing; the page just reads "not found".

`publish-site` runs on `workflow_run`, not `on: push`, because **a commit made with
`GITHUB_TOKEN` does not trigger another workflow** — GitHub's own loop protection. Six
schedules add up to twelve triggers a day and most find nothing, so it compares the tip of
`main-node` against `out/.source` on the deployed branch and stops when they match: a
skipped run takes 7 seconds against 2m20s for a real one.

**Let CI do the deploying.** The build is deterministic for a given Node version but not
across them: CI pins 22, and building the same commit on 26 produced five different app
chunks out of twelve. CI against CI is byte-identical, which is what keeps the pushes
small; a manual `deploy:site` from a different Node is a one-off large push, not a broken
site.

---

## Current shape

2,785 cards · 4,843 printings · 60 sets (22 boosters, 36 starter decks) · 2,172
Standard-legal, 20 via the block exception · 2,651 priced · 21,027 decklists —
English 15,168 from 2022-10, Japanese 5,859 from 2022-07 · 7,163 tournaments · 8,686
named players, 2,874 with more than one result · 19,419 recorded matches from 277 brackets · 43/46 release windows ·
53 dated set releases · 67 announced official events across 6 types · 109 tests.
