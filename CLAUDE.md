# Poneglyph — working notes

Unofficial ONE PIECE CARD GAME archive and metagame tracker. Next.js 16 (App
Router), TypeScript, no database — ingest scripts write JSON, the site is built from
it, and accounts are the one exception (Supabase, for saved decks and organizer
submissions).

**Every page carries a Bandai disclaimer. Do not remove it, and do not add anything
that implies official standing.** It is one line in the footer now, with the full
notice on `/legal` and shown once in a first-visit banner — the wall of text was at
the foot of all 4,700 pages, which is the surest way to teach a reader to scroll
past it. The banner does not replace the line and must not: it is dismissible and
per-browser, and somebody landing on a card page from a search engine has to be
able to answer *is this official* there, not only in a bar they clicked away on a
different day. `/legal` is the notice, `/privacy` and `/terms` are
the two URLs the OAuth providers require.

**A page opens on its content, not on a paragraph about itself.** Five pages led
with an explanation — what the metagame page averages and why, what the deck
builder checks while you build, that spoilers are unofficial, that Bandai's
registration dates are a guideline — and the metagame page spent a five-figure
stat row on top of it. A reader arrives wanting the table. Those intros are gone,
and with them `regionsJson` from `/decks`, which nothing else on that page read.

Two of them carried something that could not simply go, and neither is lost.
Bandai's *guideline, organisers vary* is printed by `EventBrowser` as `· guideline`
beside every registration time it takes from the month table — which is where the
reader meets the date, and so where CLAUDE.md's rule that the caveat travels with
the data is actually satisfied. On `/spoilers`, that these are somebody else's
images of cards that are not out is the reason the page may show them at all, so
attribution and *liable to change* moved into the line already at the foot of the
page rather than being restated twice at the top.

When a caveat comes off a page it has to land somewhere, and mostly it already
had: the metagame's sampling line is `/data` under *How to read the numbers*, and
*if we and Bandai disagree, Bandai is right* is `/legal` under *Rules and
rulings*, both said better and at length. Two facts from the banlist header were
the exception — that a ban applies to every printing of a card, and that
restrictions cover Standard and Extra unless stated — because those are facts
about the rules rather than about this site, and nothing else carried them. They
are on `/data` now, with the effective date and the source, which that table had
also never listed.

**Caveats live on the page that exists for them, not on every page.** Ten pages each
carried a dashed red callout, which made the treatment reserved for "look at this"
the thing a reader met almost everywhere. How the archive is built — sampling, decks
against entrants, spellings never merged, what a matchup is — is on `/data` under
*How to read the numbers*; what this site is and is not is on `/legal`; accounts are
on `/privacy` and `/terms`. A browse page keeps at most one line of provenance
(`.source-line`) and a link. The exception is `MetaBrowser`, whose two warnings are
conditional: they describe the table in front of you right now, so they stay, as a
line rather than a box. Its events section spends the one plain line the rule
allows, on the only thing a reader cannot work out unaided — *Decks* and *Entrants*
disagreeing, because a 128-player Regional is four rows when the source published
only what placed.

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
| `npm run ingest:decks -- --backfill --since 2023-01-01` | Reach past where the archive already is |
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
| `npm run build:cdn:lock` | Same, plus a referrer check — **read the cost first** |
| `npm run deploy:cdn` | Upload `cdn/` to Cloudflare Pages |
| `npm run build:static` | `out/` for GitHub Pages — needs `NEXT_PUBLIC_CDN_URL` |
| `npm run serve:static` | Serve `out/` on 4322 **the way Pages does** |
| `npm run deploy:site` | Push `out/` to `main-selfhost` |

`build:indexes` is not optional plumbing: it merges the corpora, deduplicates,
derives release eras, shards the matchups, and writes both the browser payloads and
`data/decks-merged.json`. A deck or matchup ingest without it leaves the site on
stale data.

The modules above the ingests are pure and imported rather than inlined, and both
properties are load-bearing: shared so two copies cannot drift, pure so a test can
run them. Every one of them is a place where a number is decided — including
`corpus-guard.mjs`, where the number is how much of an archive may vanish between
two runs before the answer is refused.

---

## Pipeline

```
sources.mjs          every upstream, with its role and limits
corpus-guard.mjs     when an answer is too small to overwrite what is recorded
refusal.mjs          an upstream that will not talk, told apart from a bug of ours
limitless.mjs        the rate limiter and request helper, shared by two ingests
matchups.mjs         a bracket -> results, and the flip that stores both sides
price-history.mjs    the append and the ninety-day trim, both pure
submissions.mjs      an organizer's answer -> corpus rows
ingest.mjs           cards     -> data/cards|sets|filters|meta.json + cards-index
                                 + data/price-history.json (one point per change)
ingest-decks.mjs     Limitless -> data/decks|tournaments|decks-state.json
ingest-matchups.mjs  Limitless -> data/matchups.json (pairings, resumable)
ingest-topdecks.mjs  Top Decks -> data/decks-{en,jp}.json (guarded, writes nothing else)
ingest-spoilers.mjs  leaks     -> data/spoilers.json (two categories, see below)
discord.mjs          messages  -> cards, pure so a test needs no bot token
ingest-discord.mjs   Discord   -> data/spoilers-discord.json (needs a bot, see below)
ingest-banlist.mjs   Bandai    -> data/banlist.json (+ numbers-only in public/data)
ingest-events.mjs    Bandai    -> data/events-official.json (+ public/data)
ingest-submissions   Supabase  -> data/decks-community.json (approved only)
build-indexes.mjs    all       -> public/data/decks-{en,jp}-index.json,
                                 public/data/decks-{en,jp}-archive/{YYYY-MM}.json,
                                 public/data/decks-{en,jp}/*.json,
                                 public/data/{events,players,deck}/*.json (256 each),
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
tournament* — 152,529 matches from 1,020 brackets, back to March 2023. Nothing is
inferred from standings. It follows that matchups cover **Limitless events only**:
Top Decks publishes finishing lists and organizers are not asked for brackets, so
the table says whose events it is drawn from — and shows nothing at all under the
Japanese view, because Limitless is an English-corpus source and an English table
under a Japanese heading would be real matches about a different metagame. Mirrors
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

**A release window is closed at both ends.** Picking a set under *Since release*
used to mean "from that day to now", so the oldest release answered with the entire
archive — decks from 2026 under a heading about 2022, played with sets that did not
exist. An era now runs until the next **expansion** entered play, and only the
newest one is open, because that one is still going on.

The next *expansion*, not the next set of any kind: a starter deck does not end a
format. Measured against the corpus, ending on any release at all made OP-01 one day
wide and two decks deep — three products entered play inside 48 hours at the start
of the archive — where ending on the next expansion makes it 98 days and 160 decks.
It also stops ST-30 cutting OP-16 in half. `windowEnd()` is exclusive, so the day a
set arrives belongs to its own era; `withTrend` measures the previous window against
the same length, and the matchup table takes both ends.

**The two regions do not share a release calendar**, so an era is a question one
corpus can answer and the other cannot — five sets entered play in Japanese that
never did in English, and two the other way. A release this corpus never had
therefore answers with **nothing**, and says so. It used to fall through to "no
start date, so no filtering" and report the whole archive under a heading naming
that release: real numbers, wrong question, with the dropdown still reading *Choose
a release…*. Reachable by switching region with one selected, not only by typing a
URL.

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

**The metagame page opens with ten archetypes, and shows what it counted.** A
window holds up to 141 and the tail is decks somebody brought once, so the table
takes the top ten and the rest are one click away — which closes again whenever a
control above it changes, since every one of those changes what the top ten *are*.
Below it, *Latest winners* replaced a top-eight list (eight rows of one Regional is
a standings page, and the placing column went with the change because every row now
reads 1st), and *Events in this window* is the section the page had been missing:
every figure above it is an aggregate and nothing said what of. It is rebuilt from
the deck rows already downloaded — they carry the event id, name, kind and field
size — so it costs no request, and it is scoped to the window, region and filters
chosen right here, which is what makes it a different question from `/tournaments`.

**One action on a panel gets `.chip-solid`.** An outlined chip reads as a label
when it is the only thing on a panel — *Sign out* was measured as, and looked
like, a wide empty box. The solid variant is the same shape a step louder: the
lifted slab, the stronger edge, the carve the slabs themselves use. It is not a
new colour and not a new shape, because the site has one of each.

**A chip that is a button is a control, and the selector says so.** `.chip` was
one rule for two things: a tag you read and a button you press. So a control had
no pointer, no pressed state and no disabled state — the region toggle on
`/tournaments` and `/players` drew *Both*, *English* and *Japanese* with the same
background, border and colour whichever was selected, measured rather than
guessed, which left those pages unable to say what they were filtered to. The
states hang off `button.chip` and `a.chip` rather than a class, so every control
gets them and every `span.chip` label is untouched with no markup to change; that
also retired `.chip-link`, which had become a class resolving to nothing across
fourteen files. Selected reuses the accent underline `.window-chip` already means
it with, because two controls answering the same question should look the same
doing it. Focus is left to the one `:focus-visible` rule in `globals.css` — a
chip-specific ring would have been the same mistake in a different colour.

**`.link-btn` lives in `globals.css`, and used to live in two stylesheets.** Both
copies were byte-identical and each carried a comment arguing that repeating the
rule beat letting one control look different on different pages. What neither
noticed is the third case: `/decks` and `/decks/[slug]` load neither file, so on
the metagame page and every archetype page the control rendered as a raw grey
browser button — *Show all recorded results* and *Show 5 more with fewer than 5
games*, both of them. A rule used on five routes belongs in the file every route
loads.

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

So `build-indexes.mjs` groups the corpus by entity into **256 buckets** and a page pulls
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

**Who you are is a name with a menu behind it, in the site's own geometry.** The
trigger is a `.chip`, which is already what a small control looks like here, and
the panel takes `--radius` and the same edges as every slab. An earlier version
answered "too big" with 999px and 12px corners, which fixed the size and broke the
shape — the only thing the menu keeps of its own is `--lift` instead of `--carve`,
because a panel floating *over* the page is the one thing not carved *into* it,
and that is a lighting difference rather than a shape one. At rest the account is one line
of text in the top right; *Change name* and *Sign out* live in a dropdown, which
is also where anything added later goes without the page growing to hold it. It
was a bordered card carrying a name and a button — a lot of furniture for two
facts, and square beside a page that is mostly a list.

The menu is the one place the site's 3px `--radius` is not used: 999px on the
trigger, 12px on the panel, and `--lift` rather than `--carve`, because a thing
floating *over* the page is the one thing here that is not carved *into* it. It
closes on Escape and on a pointer down anywhere else, and closing returns focus
to the trigger so a keyboard does not lose its place; `aria-haspopup` and
`aria-expanded` are what make it a menu rather than a button that did nothing.

**Who you are sits beside the heading, not under it.** `.account-page` is a grid:
the title takes column one, `.account-who` takes column two and spans the two
heading rows, and everything below runs `1 / -1` because a list of decks has no
reason to be narrowed by a card. The card has to be a *direct* child for that, so
`AccountView` renders it as a sibling of the stack rather than inside it — a
grandchild cannot be placed in a grid's second column. Under 48rem the second
column goes away and the card returns to being the first thing under the title.

**The role line is gone, and with it the only link to `/review`.** It said
*Reviewer — submissions waiting for review* to an admin and *Organizer — you can
submit tournament results* to an organizer. `/review` is not in the nav, not in
the footer and noindex, so it is now reachable only by typing the path. Removed on
request and worth restoring with it.

**The signed-in account page is a stack, and was four touching slabs.** Who you
are, the ways in, the organizer request and your decks are each a bordered panel,
rendered as siblings with nothing between them — 0px, measured twice — so they met
edge to edge and read as one panel with rules drawn across it. `.account-stack`
holds the gap in one place rather than a margin on each, so a fifth section cannot
arrive without it, and it overrides `.section`'s generous `padding-block` so the
deck list sits the same distance down as everything else. It also gives them one
width: `.account-ask` capped itself at 34rem from when it was a block on its own,
which made the panels 750, 510 and 750 pixels wide with right edges that did not
line up. Prose is held to a measure by `.account-ask-note`, which is where a line
length belongs — on the text, not on the panel around it.

Two more came out of rendering that view rather than reading it. **Sign out was a
full-width bar**: `.account` is a grid, so a direct child stretches to the column,
which is what the signed-out provider buttons want and the opposite of what a
small control wants; the provider buttons sit one level deeper, so
`.account > .chip { justify-self: start }` reaches only the one that was wrong.
And its inline `margin-top` doubled the grid's own gap, so it went.

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

**Linking a second provider is no longer offered on the page.** The *Ways in*
panel is gone — with it the only route to `linkIdentity`, so an account keeps
whichever provider opened it. `useAccount` still exports `linkProvider` and
`unlinkProvider`, unused, because the reasoning below is still true and the panel
is a component away if it comes back. What follows describes why it worked the
way it did.

**Two providers are two accounts until somebody links them.** Supabase gives a
Discord sign-in and a Google sign-in different users even on one address, and that
is correct: merging on a matching email is an account takeover waiting for a
provider that stops verifying them. So the account page lists which providers open
this account and offers to attach the other — `linkIdentity`, from inside the
account you are keeping. It needs *Manual linking* enabled in the dashboard, and it
cannot merge two accounts that both exist: the second comes back as "already linked
to another user", and the way out is to delete the spare.

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
| `decks-en-index.json` | 117 KB | English table, last 90 days |
| `decks-jp-index.json` | 38 KB | Japanese table, last 90 days |
| `decks-{en,jp}-archive/{YYYY-MM}.json` | 20 KB median, 78 KB worst | the months an older window covers |
| `decks-{en,jp}/{leaderId}.json` | 4 KB median, 74 KB worst | one archetype's card lists |
| `events/{NNN}.json` | 12 KB | one event page (256 buckets) |
| `players/{NNN}.json` | 11 KB | one player page (256 buckets) |
| `deck/{NNN}.json` | 13 KB | one decklist's row (256 buckets) |
| `leaders.json` · `card-names.json` | 1.8 / 26 KB | archetype names · names and prices |
| `tournaments-index.json` | 12 KB | /tournaments, last 90 days |
| `players-index.json` | 53 KB | /players, everyone with 5+ results |
| `tournaments-archive.json` · `players-archive.json` | 128 / 215 KB | only on "include the rest" |
| `matchups/{leaderId}.json` | 1–31 KB | one archetype's pairings |
| `events-official.json` | 3.9 KB | the events page, whole |

Card prices are the one figure that appears in three of these. It is in
`cards-index.json` already (`$`), so the deck builder totals a deck for free; the
decklist and archetype pages get it from `card-names.json` instead, because they
were fetching that anyway and pulling the card index would have cost 176 KB. The
card page reads the *history* at build time and ships it as inline SVG — a payload
would have been the whole file to draw one card's line.

**The archive is a file per month, and it was one file until the backfill.** One
file was right at 21,027 decks: the whole English archive was 253 KB gzipped and
"All" was the only realistic reason to want it. Backfilling took it to 1.1 MB —
and made old eras worth opening, which is the click it exists for, so the cost
landed on exactly the reader the backfill was for. A month is the unit because
every window here is a date range, so a range selects its months by arithmetic:
`archiveMonthsFor()` in `lib/meta.ts`, tested against a fixture with two months
deliberately missing, because a payload that is not there is answered on a static
host with the whole of `404.html` — as JSON, which fails to parse. An era is now
one to three requests of about 20 KB. "All" still costs the full 1.1 MB, which is
what all costs, but in parallel and cached a month at a time.

Two things were tried and are worth not repeating: **interning** repeated event and player
names made the file *larger* (gzip already collapses that), and shipping the whole English
corpus cost 324 KB for a page most people open to ask about last month. Splitting by
recency is what worked.

---

## Gotchas

**Control characters in regexes.** A `\b` written through a patch became a literal `0x08`
three separate times, and a fourth time it was worse: inside a **template literal**
`\b` *is* the backspace character, so a regex built as
`` new RegExp(`\b(?:${COLOURS.join('|')})\b`) `` compiled and matched nothing — and
`npm run check` cannot see that one, because the file holds a backslash and a `b`
and only the runtime turns them into a control character. Build a regex out of a
variable by concatenating plain strings. Invisible in an editor and in a diff, the
regex compiles, and it matches nothing — the last one made the block-update list read as empty, twenty legal
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

**Discovery stops where the archive already reaches.** The tournament listing is
read newest first and the loop breaks at the first page whose every entry has been
seen, because new events arrive at the front. That is right for keeping up and it
made a backfill impossible — no budget would have helped, since the loop exits
before spending one. `--backfill` pages to the cutoff instead, at one request per
page: 57 to reach the end of the listing, which is 19% of a 300-request budget and
worth paying only while there is history left to collect.

**The corpus outgrew its shards, and the shard count is a payload budget in
disguise.** 64 buckets held ~10 KB a page at 21,000 decks; at 69,708 the same
arithmetic gives ~380 KB, so every event, player and deck page would have pulled
that to draw a handful of rows. It is 256 now, and the bucket name went from two
digits to three — which `tests/parity.test.ts` caught the moment the count changed,
because 256 does not fit in two. The same pressure moved `DIRECTORY_MIN_RESULTS`
from 2 to 5: of 18,960 players, 9,449 appear once and 3,115 twice, so "two or more"
stopped meaning regular and trebled a payload that loads on arrival.

**`decks-merged.json` carries no card lists.** It is imported by `lib/decks.ts`, so
`resolveJsonModule` infers a literal type for every key in it — pleasant at 26 MB
and fatal at 83, where `tsc --noEmit` dies with *Ineffective mark-compacts near heap
limit* and takes the build with it. The fifty cards of 69,708 decks were the weight,
and no page reads them from there: the archetype pages fetch
`decks-{region}/{leaderId}.json` and the deck page fetches its shard. What the file
is for is resolving *which* deck, not what is in it.

**Rate limit.** Limitless advertises `RateLimit: "50-in-5min"`. The ingests read that
header and pause *before* being refused. Raising `--max` does not make a run faster,
only longer. The limiter lives in `scripts/limitless.mjs` because two ingests now use
it, and two copies would mean two limiters against one server, each unaware of the
other's requests — which is the shape of an accidental ban rather than of a rate
limit. `update-matchups` runs three hours after `update-decks` for the same reason.

**`data/decks.json` is 66 MB and GitHub says so on every push.** *"larger than
GitHub's recommended maximum file size of 50.00 MB"* is a warning, not a refusal —
the hard limit is 100 MB and a push over it is rejected outright. Measured: 58,214
rows across 41 months is 1,410 a month and 1.6 MB a month, which reaches 100 MB in
about 21 months. Nothing to do today; the thing not to do is discover it on the
push that fails. Splitting the corpus by year is the obvious way out, and it is
cheaper to do while nothing depends on the file being whole — `build-indexes.mjs`
reads it once and derives everything else, so it is the only reader.

**`decks-state.json` holds `details`.** That map is the only copy of each event's venue. An
earlier "slimming" of the loader dropped it and a rebuild reclassified all 275 tournaments
as `unknown`. Re-fetching cost 289 requests.

**A refusal is not a breakage, and its newest disguise is an empty page.**
onepiecetopdecks.com sits behind a filter that occasionally answers a datacenter
IP with a Cloudflare challenge — an HTML body under a **200**, so `res.ok` is true
and the failure surfaces as `Unexpected token '<'`. On 2026-09-02 it did something
worse: it served every one of the forty deck-list pages to a GitHub runner as a
200 that parsed cleanly and yielded **zero decks**, and `ingest-topdecks.mjs` wrote
both corpora away to nothing. The same command from a home connection read 6,037
and 5,920. Nothing between the empty answer and the write said no — the invariant
below claimed otherwise and this ingest was the one that did not hold it.

That was one of two shapes, and the run that proved the fix hit the other: the
next scheduled attempt could not reach the index page at all (`fetch failed`) and
`ingest-topdecks.mjs` exited 1, because only the spoilers ingest had been taught
that a refusal is not a breakage — for the same host. `scripts/refusal.mjs` is
that judgement, shared so the two cannot drift, the way `limitless.mjs` shares a
rate limiter: 403/429/503 and a connection that never completed are the upstream's
decision and exit 0 with a `::warning`; a parse that broke or a shape that changed
is ours and still exits 1. What it cannot see is a refusal wearing a successful
answer, which is the other half:

`scripts/corpus-guard.mjs` holds it now: `refusesWrite(found, held)` refuses an
empty answer over a non-empty corpus, and any run that comes back with less than
half of what is recorded — these are per-set archive pages, so the count only ever
grows, and half is loose on purpose because the number to catch is zero and a
guard that cries wolf gets removed. It is a module rather than eight lines in the
script because it is the only thing standing between an upstream's bad morning and
an emptied archive, and a guard nothing exercises can silently invert; a mutation
test proved that by deleting a `Math.max` from it and passing, which is how a dead
branch in the first version was found. A refusal warns and exits 0: the corpus on
disk is untouched, and a job red every eight hours for someone else's filter is a
job nobody reads.

**Up to a point, and that point is three days.** Exiting 0 on a refusal is right
for one run and wrong for twenty. It was wrong for twenty: `update-spoilers` runs
four times a day and spent five days green while this host turned the runner
away, so `/spoilers` served twelve-day-old reveals under a wall of green ticks.
Nothing in the schedule said so — what surfaced it was somebody looking at the
page and asking. `exitOnFailure` now takes `since`, the `generatedAt` of the file
on disk, and past `STALE_AFTER_HOURS` a refusal goes red after all: still nothing
written, but the archive is out of date and the green run was what hid it.
Seventy-two hours is deliberately generous — a blocked afternoon, a weekend of
one, an upstream migration should redden nothing.

The guard is per region, and the run meant to prove it came back **green having
read nothing**: the filter served the deck-list index as a 200 whose HTML carried
no links, so forty pages became zero, both regions were skipped by a `continue`
that said nothing, and the guard never ran. An index with no links on it is the
same refusal one page earlier — the site publishes forty archive pages, and if it
publishes none we were not talking to the site — so that is a refusal now too. A
region whose own pages vanish from an index that otherwise has links is a
different thing, a URL prefix Top Decks renamed for the third time, and it warns
rather than refusing the run.

`--limit N` now reads without writing, for the same reason and not as an
afterthought: a spot check of two pages looks exactly like a collapse to the
guard, so the flag makes the ingest read-only rather than unguarded — which is
also what you want from a flag whose whole purpose is reading a couple of pages
by hand.

Two things followed from the same run. `build-indexes.mjs` failed on the empty
corpus as `Invalid time value`, from `shiftDays(index.window.to, ...)` with a null
date — a message naming neither the region nor the file that should have filled
it; it stops earlier now and says which corpus is missing. And
`ingest-topdecks.mjs` no longer writes any `public/data` payload. It used to write
`decks-{en,jp}-index.json` and the per-archetype card lists, from before
`build-indexes.mjs` merged the corpora; since then build-indexes rewrote both
seconds later on every run, so those copies were only ever visible when
build-indexes did not get that far — which is exactly what happened, leaving a
0 KB index behind. One writer per payload. It reddened `update-spoilers` four times in thirty-six hours
while the same host answered `update-rules` fine, minutes apart. Two things follow.
The backoff is in *seconds* (3, 10, 30 across four attempts): the old 0.5s/2s put
every attempt inside one blocked window. And a refusal — HTML where JSON was
promised, a 403/429/503, or a connection that never completed (`fetch failed`, a
timeout, a reset) — logs a `::warning`, writes nothing and exits **0**, since
a schedule that is red every few hours for something outside this repository is a
schedule nobody reads. Everything else still exits 1.

**A Discord channel is the fast source, and it needs a bot.** The web source
publishes a leak article and then leaves it: both of its articles were last
*modified* twelve days before anybody noticed `/spoilers` had stopped moving.
Reveals reach a community channel in minutes and keep arriving one card at a
time. Reading one means `GET /channels/{id}/messages` as an **app** — automating
a user account is against Discord's terms — with View Channel, Read Message
History, and the **Message Content** privileged intent, which is a checkbox for a
bot this size and is not optional: without it `content`, `embeds` and
`attachments` all come back **empty**, so the ingest reads a channel full of
reveals and correctly finds nothing.

**A forward is empty at the top level**, and that is how this channel is fed. A
forwarded message carries `content`, `attachments` and `embeds` blank and the real
message in `message_snapshots[].message`, an immutable copy taken when the forward
was made. Reading only the top level saw twelve posts, found nothing in any of
them, and looked exactly like a missing Message Content intent — which cost two
runs to tell apart, and was settled by asking `GET /applications/@me` whether the
intent was on rather than inferring it. Discord caps snapshot nesting at one
level, so one pass reads all of it.

**A reveal post is `Name Colour Type Rarity`, and the colour is the hinge.** They
arrive wrapped in a code fence with a role ping on the end. What sits before the
colour is the card's **name** — which the articles almost never give and which
`/spoilers` had been printing as *Name not listed* under every one of these — and
what follows is what else is known: a cost, a power, an ability. Discord's markup
comes out first, mentions included, because an id printed on a public page is
somebody's role and noise to every reader. Splitting on a colour costs a name to a
card actually called something like *Red-Haired*, where nothing sits before it,
and that is deliberate: no name is better than a blank one.

**A reveal opens itself, and only on `/spoilers`.** The picture links to the file
it is showing — `/spoilers/EB05-036.webp` — in a tab of its own. A card is drawn a
couple of centimetres wide in that grid and the next thing a reader wants is a
closer look, which here is the file itself: there is no card page to send them to
until the set ships, which is the whole condition for being on this page. A new
tab rather than a navigation, so coming back finds the grid where it was left.

**The text is the reveal, when the card is not English.** A Japanese card arrives
as a photograph plus somebody typing out what it does, and that transcription is
the only thing on the site that says what an unreleased card does — an English
reveal comes with none, because the picture is already readable. It is kept under
the same rule as the image and for the same reason: a message naming one card is
about that card, and a message naming six is about six, so text from the second
kind is dropped rather than printed under whichever number came first. The card
number is taken out of it, since the page prints that beside it, and anything past
600 characters is a conversation rather than a card.

Two halves of a message are read because neither is reliable alone: an attachment
named `OP18-021.png` is the card it names, and a phone photo named `IMG_4821.jpg`
beside a typed number is that number's card. A message naming six cards with one
photo attaches the photo to **none** of them — guessing would put the wrong art on
a card. `discord.mjs` is where that lives, pure and import-free, because
everything else about this source needs a token and a server and so cannot be
exercised in CI; `ingest-discord.mjs` takes `--fixture` for the same reason.

**A test that writes where the site keeps its files will delete them.** The
Discord ingest prunes thumbnails no card points at, and a fixture corpus points at
none — so `npm test`, which spawns the script, removed every real thumbnail in
`public/spoilers`. Because `npm run verify` runs *before* `build:static` in
`publish-site.yml`, the deploy then exported a site whose twelve reveal images had
been deleted minutes earlier by its own test suite, and the only symptom was
twelve 404s on the live page. The script takes `--out` and `--thumbs`, the tests
point both at the temp directory, and one test asserts that `public/spoilers` is
untouched by a run. This is the second time here: the same tests deleted
`data/spoilers-discord.json` before that.

**Discord's image links expire and that decides the whole image question.**
Attachment URLs are signed — `?ex=&is=&hm=` — and Discord refreshes them only
inside its own payloads. A link saved into a static JSON file is dead within
hours, so hotlinking the way `/spoilers` hotlinks Top Decks is not available.
Copying them is a policy question rather than a technical one, since these are
photographs of cards that are not out, so the ingest records the link it saw and
does not act on it.

**Reveals are filed in two categories, and one of them is called nothing.**
onepiecetopdecks.com has five categories and puts leak coverage in two: *Card
Leaks*, which has 15 posts, and *Uncategorized*, which is where ST-31..36, OP-15,
EB-04, ST-29 and the P-122 promos went. Reading only the one named for the job
missed those until each set shipped. Both are read now — which adds no cards
today, since both top out at the same two articles, and is coverage for the next
time rather than a fix for a set currently missing.

Widening it needed one other thing first. WordPress writes a resized copy of every
upload as `name-{width}x{height}`, so `prb22-1024x461.jpeg` read as set `PRB22`,
card `102` — a set that does not exist holding a card that does not exist, which
`/spoilers` would have announced as an unreleased set. Three of them, all from
*Uncategorized*, which is why the bug was latent. Card numbers are three digits
with nothing but a separator after them, so `cardsFromHtml` refuses a fourth digit
and the resize suffixes fall out while `-aa`, `_p1` and `_p2` stay.

**What the source publishes is not what it reveals.** The OP-18 article carries 11
distinct images and 6 identifiable cards: two are named for the character rather
than the card (`Saint-Shamrock.jpg`), and one is an alt art of an already-released
set. EB-05 carries 10 images and 2 cards, the rest being `_p3` reprints of cards
that shipped years ago. So a count that looks low against the images on the page
is usually right, and the way to check is the image filenames, not the prose.

**Ingests refuse to write nonsense.** Too few cards, an empty banlist, a dead spine — each
aborts before overwriting. An empty banlist that looks successful is worse than none. The
submissions ingest is the exception: zero approved submissions is a real answer. Top Decks
was an exception too, silently, until the day the source answered with nothing and it wrote
that down; `scripts/corpus-guard.mjs` is what makes the sentence true of it.

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
| Discord | Card reveals, minutes after they leak | Bot token, private channel |
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
`update-discord` (2h — the fast spoiler source, and it rebuilds `spoilers.json`
in the same run so a reveal does not wait six hours for the other schedule),
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

**Always `git add data public/data`, and `public/spoilers` where it applies.**
`update-discord` wrote twelve thumbnails in the runner and staged neither, so the
corpus recorded that every EB-05 card had a picture while the page pointed at
twelve files that had never left the machine — the third time this has happened
here. Three workflows did not — one staged only `data/`, the
other named individual files, a list that went stale the moment the per-entity shards
appeared. They run `build-indexes.mjs` or an ingest that writes into `public/`, so the
archive refreshed and the site kept serving what it had.
Nothing fails when a payload is missing; the page just reads "not found".

**A new ingest workflow has to be added to `publish-site.yml`'s `workflows:` list**,
or its commits are never deployed. `update-discord` wrote twelve thumbnails,
committed them, and the site went on serving a build that predated them — no run
failed, because nothing ran. That list is the deploy trigger, and it is the third
thing a new ingest needs after the schedule and the `git add` paths.

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
Standard-legal, 20 via the block exception · 2,651 priced · 69,708 decklists —
English 63,814 from 2022-10, Japanese 5,894 from 2022-07 · 7,904 tournaments ·
18,960 named players, 3,691 with five or more results · 152,529 recorded matches
from 1,020 brackets · 44/46 release windows · 53 dated set releases · 67 announced
official events across 6 types · 180 tests.
