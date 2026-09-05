# Poneglyph

A searchable archive and metagame tracker for the ONE PIECE CARD GAME: every card,
every printing, every stat line, plus twenty thousand tournament decklists and what
people are actually winning with.

> **Poneglyph is an unofficial fan project.** It is not affiliated with, endorsed
> by, or approved by Bandai. Card images, names and rules text are the property of
> their owners and appear here for reference. Full notice at `/legal`.

```bash
npm install
npm run ingest          # cards            ~45s
npm run ingest:decks    # tournaments      budgeted, resumable
npm run ingest:topdecks # JP/EN archives   ~15s
npm run build:indexes   # derive everything the site reads
npm run dev             # http://localhost:4321
```

---

## What is in it

| | |
| --- | --- |
| Cards / printings / sets | 2,785 · 4,843 · 60 |
| Standard-legal | 2,172 (613 Extra only) |
| Traits / keywords | 171 · 45 |
| Priced | 2,651, with ninety days of history |
| Decklists | 21,027 |
| — English | 15,168, back to Oct 2022 |
| — Japanese | 5,859, back to Jul 2022 |
| Tournaments / players | 7,163 · 8,686 |
| Recorded matches | 19,419, archetype against archetype |
| Release windows | 43 English, 46 Japanese |
| Official events announced | 67 across 6 types |

## What you can do with it

**Search cards** by name, number, colour, type, cost, life, power, counter,
attribute, trait, keyword, rarity, set, block or format — 2,785 cards filtered in
the page, every filter state a shareable URL.

**Read the metagame** for a region, a window (7 / 15 / 30 / 90 days, all, or since
a set entered play), an event tier and a play setting. Share, win rate and movement
against the previous window, recomputed in the browser.

**See a real matchup.** Every other win rate on the site is a record against the
field. The matchup table on an archetype page is its record against a *named*
opponent, built from published Swiss and top-cut pairings — with the sample beside
every percentage, because 67% from three games is noise wearing a number.

**Follow the thread.** Archetype → decklist → player → their other events →
tournament standings → back to a card. Every name is a link. `/tournaments` and
`/players` list what those pages are pages of: every recorded event with its winner,
and everyone with a result to their name.

**Watch a price move.** Each card keeps ninety days of lowest-listed prices, and the
card page draws them. Nothing is back-filled, so a card the ingest has seen once
says so rather than drawing a flat line.

**Build a deck** on `/deckbuilder`: pick a Leader, fill fifty cards from its
colours, and see copy limits, rotation and the banned list checked as you go — plus
the cost curve, the counter total and what the deck would cost to put together.
Nothing is saved unless you have an account and ask for it; one button copies the
list for OPTCGSim.

**Export any decklist** in the format OPTCGSim reads, straight to the clipboard.

**Run events?** Ask for the organizer role from your account page — who you are,
what you run, somewhere it can be checked — and you can submit a tournament and its
decklists. Both the role and each event are granted by a person reading them: every
number here is derived from recorded results, so nothing joins them unreviewed.

**Find a tournament** on `/events`: every official event Bandai has announced,
filterable by region and type, with venues, registration links and when
registration opens — which is a Sunday, and which they publish as a guideline.

**See what is coming** on `/spoilers`, and what is currently banned on `/banlist`,
both read from source rather than maintained by hand.

---

## How it works

No database. Ingest scripts pull from public sources, validate and merge into JSON;
the site is built from those files. `data/*.json` is imported at build time;
`public/data/*.json` is fetched by the browser.

```
scripts/sources.mjs         every upstream, with its role and its limits
scripts/ingest.mjs          cards
scripts/ingest-decks.mjs    Limitless tournaments
scripts/ingest-matchups.mjs Limitless pairings, archetype against archetype
scripts/ingest-topdecks.mjs Top Decks archives (JP + EN)
scripts/ingest-spoilers.mjs unreleased sets
scripts/ingest-banlist.mjs  banned & restricted
scripts/ingest-events.mjs   official events (Regionals, Finals, Cups)
scripts/build-indexes.mjs   merges everything into what the site reads
scripts/check-sources.mjs   source hygiene, runs before the card ingest
```

A few decisions are worth knowing, because they change what the numbers mean:

- **Cards and printings are different things.** `OP01-025`, `_p1`, `_p2` are three
  printings of one card, shown as `OP01-025`, `OP01-025 V2`, `V3`.
- **Sampling is tracked per deck.** Limitless publishes whole Swiss fields, Top
  Decks publishes decks that placed. Share counts everything; win rate counts only
  whole-field results and shows its sample.
- **Release windows are derived from results**, not from a hardcoded calendar, and
  measure when a set entered *play* rather than when it was printed.
- **Matchups come from brackets, not from records.** They cover Limitless events,
  which is where pairings are published, and the table says so.
- **Standard legality follows Bandai's published exception list**, so the 20 Block 1
  cards that stay legal are marked as such instead of reading as rotated out.
- **Absent values say "Not recorded"** rather than showing a blank or a zero.

The full reasoning, the invariants and the traps live in [CLAUDE.md](CLAUDE.md).
Moving the site to a domain of its own, changing CDN, or hosting it on a real
machine: [MIGRATIONS.md](MIGRATIONS.md).

---

## Where the data comes from

| Source | Role | Access |
| --- | --- | --- |
| [Punk Records](https://github.com/buhbbl/punk-records) | **Primary cards** — every printing, typed, from the official card list | Static JSON |
| [Vegapull Records](https://github.com/Coko7/vegapull-records) | Rules text in bulk | Static JSON |
| [OPTCG API](https://optcgapi.com/) | TCGplayer prices, printable set names | Public REST, no key |
| [Limitless](https://onepiece.limitlesstcg.com) | **Tournaments** — standings with full decklists | Documented API, no key |
| [One Piece Top Decks](https://onepiecetopdecks.com) | JP and EN archives back to OP-01; leaks | WordPress API |
| [Official rules pages](https://en.onepiece-cardgame.com/rules/) | Banlist, block-number updates | HTML |
| [Official event pages](https://en.onepiece-cardgame.com/events/) | **Events** — dates, venues, registration links | HTML |

Punk Records also publishes Japanese, Korean, Thai and Chinese card data —
`npm run ingest -- --lang japanese` builds any of them.

**Two sites are deliberately not used.** [onepiece.gg](https://onepiece.gg) names
automated agents as disallowed in its `robots.txt` and 403s non-browser clients —
an explicit opt-out, so it is linked and never fetched.
[optcg.one](https://www.optcg.one) disallows `/api/`. (`matchmaking.gg` is a parked
domain, not a TCG site.)

### Card art

The official CDN sends `Cross-Origin-Resource-Policy: same-site`, so its images
cannot be embedded from another origin. `/art/[id]` fetches server-side instead —
once per image, ever — and mirrors to `public/cards`.

Those PNGs are 600×838 and 348 KB regardless of where they appear, and a table row
renders one at 38 px. `npm run build:cdn` converts the mirror to WebP at the three
widths actually used (96 / 320 / 600), and `npm run deploy:cdn` uploads it to
Cloudflare Pages as an assets-only project on a free `*.pages.dev` subdomain.

| | Before | After |
| --- | --- | --- |
| A grid tile | 348 KB | **30 KB** |
| A grid of 60 | 18 MB | **~1.5 MB** |

Set `NEXT_PUBLIC_CDN_URL` to use it; leave it unset and the local proxy answers, so
a fresh checkout works with no CDN. Leak scans stay on Top Decks' server with
attribution.

---

## Keeping it current

Seven GitHub Actions workflows, each committing only when something substantive
changed:

| Workflow | Cadence | Does |
| --- | --- | --- |
| `update-cards` | daily | Rebuilds the card archive, gated on `ingest.mjs --check` |
| `refresh-prices` | 2×/day | Market prices |
| `update-decks` | 2×/day | New tournaments, then `build:indexes` |
| `update-rules` | every 8h | Banlist and Top Decks archives |
| `update-spoilers` | every 6h | Unreleased-set reveals |
| `update-events` | daily at noon | Official events, venues and registration dates |
| `publish-site` | after any of them | Builds `out/` and pushes it to `main-selfhost` |

`publish-site` runs on `workflow_run` rather than on a push, because a commit made
with `GITHUB_TOKEN` never triggers another workflow. Those five schedules add up to
twelve triggers a day and most find nothing, so it compares the tip of `prod`
against the commit the live site was built from and stops when they match.

**Actions minutes are unmetered on a public repository.** A private one gets 2,000 a
month on the free plan, and `update-decks` alone spends about 1,800 — a 300-request
budget waits out six rate-limit windows, and waiting is billed like working.

`node scripts/ingest.mjs --check` exits `0` when upstream has moved and `3` when
the archive is current, so a scheduled run costs a second on the days nothing
shipped. The deck ingest respects Limitless's advertised rate limit (50 requests
per 5 minutes) by reading the header and pausing before it is refused, which is why
it is budgeted (`--max`) and resumable.

If you would rather not commit data, the same scripts run under Vercel Cron, a
systemd timer, a Kubernetes `CronJob` or a Cloudflare Worker — the only real
decision is whether the output goes to git, object storage or a database. Git is
the default here because a bad upstream day is then a visible diff and a
`git revert`.

## Commands

| | |
| --- | --- |
| `npm run dev` / `build` | Dev server on 4321 / ~4,700 static pages |
| `npm run verify` | Source check, types and tests — what CI runs |
| `npm test` | `node --test` over `tests/*.test.ts`, no runner to install |
| `npm run check` | Fail on stray control characters in sources |
| `npm run ingest` | Cards. `-- --check` to test freshness, `-- --lang japanese` |
| `npm run ingest:decks` | Tournaments. `-- --max N --since YYYY-MM-DD`, `-- --rebuild` |
| `npm run ingest:matchups` | Pairings. `-- --max N`, resumable, one request per event |
| `npm run ingest:topdecks` | JP/EN archives. `-- --region jp` |
| `npm run ingest:spoilers` / `:banlist` | Reveals / banned list |
| `npm run ingest:events` | Official events: Regionals, Finals, Cups |
| `npm run build:indexes` | **After any deck ingest** |
| `npm run ingest:images` | Mirror card art locally |
| `npm run build:cdn` / `deploy:cdn` | Build the WebP bundle / upload to Cloudflare |
| `npm run build:static` | `out/` for GitHub Pages. Needs `NEXT_PUBLIC_CDN_URL` |
| `npm run serve:static` | Serve `out/` on 4322 the way Pages does |
| `npm run deploy:site` | Push `out/` to the site repository |

## Deploying

**Any Node host.** `npm run build && npm run start`. Everything is static except
`/art/[id]`, which needs a server the first time each image is requested — mirror
the art ahead of time and even that goes away.

**GitHub Pages**, with no server at all:

```bash
npm run build:static     # -> out/, about 580 MB
npm run serve:static     # check it on :4322 before pushing
npm run deploy:site      # -> the site repository
```

One repository, three branches. **`prod`** holds the code and the data and is what
the site is built from; **`dev`** is the same for work in progress; **`main-selfhost`**
holds `out/` and is what Pages serves.
The second is an orphan branch, rebuilt from scratch each deploy and keeping no
history — it is 24,000 generated files that change twice a day, and the history that
matters is on the first.

Configure it in `.env.local`:

```
NEXT_PUBLIC_CDN_URL=https://<project>.pages.dev
NEXT_PUBLIC_SITE_URL=https://<user>.github.io/<repo>
NEXT_PUBLIC_BASE_PATH=/<repo>          # only for a project page
PONEGLYPH_SITE_REMOTE=https://github.com/<user>/<repo>.git
PONEGLYPH_SITE_BRANCH=main-selfhost
```

Then point Pages at `main-selfhost` in the repository's settings. **A private
repository needs a paid plan for that**; on the free plan the repository has to be
public.

The static build needs a CDN — there is no image proxy in an export — and refuses
to start without one. `serve:static` answers unmatched paths with `404.html` exactly
as Pages does, which is what the event, player and deck pages rely on; `npm run
start` resolves routes itself and will happily render pages the export never wrote,
so it cannot tell you whether the deploy will work.

`public/cards` is gitignored; cache it between CI runs.
