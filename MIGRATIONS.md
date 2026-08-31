# Migrations

What to change when the site moves — to a domain of its own, to a different CDN, or
onto a real machine. Written as checklists because every one of these is a list of
places that must agree with each other, and the failures are all the same failure:
one of them still says the old thing.

---

## The one thing worth knowing first

**Changing the site's address does not change the OAuth callback.**

There are two different URLs and they are constantly confused:

| | Value | Changes with the domain? |
| --- | --- | --- |
| What Discord and Google call back to | `https://<ref>.supabase.co/auth/v1/callback` | **No** |
| Where Supabase then sends the reader | `https://<your site>/account/` | **Yes** |

The first belongs to the Supabase project and is the same forever, whatever the site
is called. So a domain move means editing the Supabase allowlist and Google's
*JavaScript origins* — and **not** touching the redirect URI in Discord or Google.

---

## Moving to a custom domain

Say the new address is `https://poneglyph.gg`.

### 1 · DNS

Point the domain at GitHub Pages. For an apex domain, four A records:

```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

For a subdomain (`www.` or similar), one CNAME to `carminelaluna.github.io`.

### 2 · The CNAME file

GitHub Pages reads the domain from a `CNAME` file in the published branch. **Do not
add it through the Pages settings screen alone**: that writes it into
`main-selfhost`, and `deploy-site.mjs` replaces that branch wholesale on the next
deploy, so the domain would revert without anything appearing to have changed.

Set it in `.env.local` instead and the build writes it every time:

```
PONEGLYPH_CNAME=poneglyph.gg
```

Add the same to the `env:` block of `.github/workflows/publish-site.yml`, or the
scheduled deploys will drop it even if your manual ones do not.

### 3 · The subpath disappears

On `carminelaluna.github.io/Poneglyph` the site lives under `/Poneglyph`. On a domain
of its own it lives at the root, so **`NEXT_PUBLIC_BASE_PATH` becomes empty**.

```
NEXT_PUBLIC_BASE_PATH=
NEXT_PUBLIC_SITE_URL=https://poneglyph.gg
```

Both in `.env.local` and in the workflow. This is the change that cascades: every URL
in every list below loses its `/Poneglyph`.

### 4 · Supabase

**Authentication → URL Configuration**

| Field | New value |
| --- | --- |
| Site URL | `https://poneglyph.gg/account/` |
| Redirect URLs | `https://poneglyph.gg/account/` |

Keep `http://localhost:4322/account/` **and** `http://localhost:4321/Poneglyph/account/`
as redirect entries for local work — the dev server serves under the base path too, and
both lose `/Poneglyph` once that is empty.

**Manual linking must be switched on** for the "Connect Discord/Google" buttons on
the account page to work: *Authentication → Sign In / Providers → Manual linking*.
Without it `linkIdentity` comes back with a 422 and the page reports it.

Supabase deliberately does *not* merge two sign-ins that share an email address —
that would be an account takeover the moment a provider stopped verifying them — so
one person signing in with Discord and then with Google has two accounts until they
link one to the other from inside the one they want to keep. Two that already exist
cannot be merged; the second comes back as "already linked to another user", and the
way out is to delete the spare in *Authentication → Users*, which takes its saved
decks with it.

**The trailing slash matters.** The site serves pages as directories, so the redirect
is `/account/` and an allowlist entry without the slash is treated as a different URL
and refused.

Leave the old entries in place for a few days if the old address still resolves;
removing them is not urgent and keeps anyone mid-sign-in from being stranded.

### 5 · Google

**Google Auth Platform → Clients → your Web application client**

- **Authorized JavaScript origins** — replace `https://carminelaluna.github.io` with
  `https://poneglyph.gg`. This is the origin of the *site*, so it does change.
- **Authorized redirect URIs** — leave alone. It is
  `https://<ref>.supabase.co/auth/v1/callback` and has nothing to do with the domain.

**Google Auth Platform → Branding / consent screen**

- Application home page → `https://poneglyph.gg`
- Privacy policy → `https://poneglyph.gg/privacy/`
- Terms of service → `https://poneglyph.gg/terms/`

If the app was ever submitted for brand verification, changing these puts it back in
review. Sign-in keeps working meanwhile; only the logo on the consent screen is at
stake.

### 6 · Discord

**Developer Portal → your application → OAuth2**

- **Redirects** — leave alone, same reason as Google.
- **General Information** → the privacy policy and terms URLs, which are the two
  fields that need the new domain.

### 7 · Everything else that names the address

- `metadataBase` in `src/app/layout.tsx` reads `NEXT_PUBLIC_SITE_URL` — nothing to
  edit, but it is what makes the link-preview image resolve, so get that variable
  right.
- `sitemap.xml` and `robots.txt` read the same variable.
- The old address keeps working as long as GitHub serves it, and redirects to the new
  one once the CNAME is live. Nothing needs to be rewritten by hand.

### 8 · Afterwards

```bash
npm run build:static && npm run serve:static
```

Check the header links have no `/Poneglyph` left in them, then deploy and sign in
once. If sign-in bounces back without a session, it is the allowlist — almost always
the trailing slash.

---

## Changing the card-art CDN

The bundle is 14,529 WebP files built from `public/cards` by `build-cdn.mjs`. What
matters is not where it lives but that whatever hosts it is **cached** and does not
meter requests.

### Staying on Cloudflare Pages, with a custom domain

Add the domain to the `poneglyph-art` project in the Cloudflare dashboard, then:

```
NEXT_PUBLIC_CDN_URL=https://art.poneglyph.gg
```

Nothing is rebuilt — `art(id, width)` composes the URL from that variable, so the
files and their names are unchanged.

### Moving somewhere else

Whatever the destination, it has to satisfy three things this bundle already relies
on:

1. **A long, immutable cache header.** Every file is named by card number and width
   and never changes. `_headers` sets a year; a host that cannot set cache headers —
   GitHub Pages, for one — throws away the entire benefit.
2. **Twenty thousand files, or a way to work without them.** Cloudflare Pages' free
   plan caps a deployment at 20,000 and `build-cdn.mjs` refuses to run past it. A
   host with a lower cap means dropping one of the three widths.
3. **Not R2 without a domain.** `r2.dev` is rate-limited, described by Cloudflare as
   development-only, and — decisively — is not behind their cache.

Then re-point `NEXT_PUBLIC_CDN_URL` and rebuild the site. The images themselves do
not need to move again if you keep the same file names.

### Turning the CDN off entirely

Leave `NEXT_PUBLIC_CDN_URL` unset and `/art/[id]` serves the images instead, mirroring
them into `public/cards` on first request. **This only works on a server** — the
static export has no route handlers, and `build:static` refuses to run without a CDN
for exactly that reason.

---

## Hosting on a real machine

A VPS, a home server, anything that runs Node. This is a bigger change than a domain:
it turns the site back into an application.

### What you gain

- **`/art/[id]` works again**, so the CDN becomes optional rather than required.
- **No 404 fallback.** On Pages, the long tail of event, player and deck pages is
  reached through `404.html` because they are not prerendered. A server renders them
  on request, with a real 200.
- No 1 GB limit, no file-count limit, no `.nojekyll`.

### What you take on

Updates, TLS renewal, uptime, and a machine that has to stay switched on. GitHub
Pages needs none of that.

### Doing it

```bash
git clone https://github.com/carminelaluna/Poneglyph.git
cd Poneglyph
npm ci
npm run build      # not build:static — the server build
npm run start      # port 4321
```

Then put a reverse proxy in front for TLS. Environment:

```
NEXT_PUBLIC_SITE_URL=https://poneglyph.gg
NEXT_PUBLIC_BASE_PATH=            # empty; a server can serve from the root
NEXT_PUBLIC_CDN_URL=              # optional now, but keep it — see below
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Keep the CDN anyway unless bandwidth is free: serving 700 MB of card art from your own
connection is the one part of this site that is genuinely heavy, and it is the part
Cloudflare does for nothing.

`public/cards` is gitignored, so a fresh clone has no images. Either run
`npm run ingest:images` — which fetches 4,843 files from the official CDN, once — or
leave `NEXT_PUBLIC_CDN_URL` set and never need them.

### Keeping it current

The ingests are the same scripts; only the scheduler changes. A systemd timer or a
cron entry running `npm run ingest:decks && npm run build:indexes` replaces the
workflow. There is no deploy step — the server reads the JSON at build time, so it
needs `npm run build` again afterwards.

If you keep GitHub Actions doing the ingestion and only move the hosting, the machine
pulls from `main-node` and rebuilds. That is the least work and keeps the data history
in one place.

---

## What never changes

Worth knowing so you do not go looking:

- **The Supabase project ref and its URL.** Migrating the *database* to a new project
  is a different exercise entirely — new ref, new anon key, re-run `schema.sql`,
  re-enter every OAuth credential, and existing accounts do not come with it.
- **The anon key**, unless you rotate it deliberately.
- **`supabase/schema.sql`** and the row-level policies. `schema.sql` is the whole
  thing for a *new* project; `supabase/migrations/` holds the same changes for one
  that already exists, **numbered in the order they must run**. All are safe to run
  twice. (They were dated at first, until two landed on one day and the order they
  sorted in stopped being the order they had to run in.)
- **The OAuth callback URLs** in Discord and Google, as above.
- **The CDN file names** — `OP01-025_320.webp` and its 14,528 siblings.

---

## Checklist

A domain move, in the order that avoids being locked out:

- [ ] DNS records point at the new host
- [ ] `PONEGLYPH_CNAME` set in `.env.local` **and** in the publish workflow
- [ ] `NEXT_PUBLIC_BASE_PATH` emptied in both
- [ ] `NEXT_PUBLIC_SITE_URL` updated in both
- [ ] Supabase Site URL and redirect allowlist updated — **with trailing slashes**
- [ ] Google authorized JavaScript origins updated (redirect URI untouched)
- [ ] Google consent screen: home, privacy, terms URLs
- [ ] Discord: privacy and terms URLs (redirect untouched)
- [ ] `NEXT_PUBLIC_CDN_URL` if the CDN moved too
- [ ] `npm run build:static && npm run serve:static`, then sign in once
