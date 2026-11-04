# The Enamel Vault

Recipes kept properly, for families and kitchens. **Two products on one codebase**, one design
system and one sign-in:

- **The family app** (`recipes.enamelvault.com`, plus a phone app): a private, multi-family
  recipe vault. Families collect, organize, and pass down their recipes with photos, story, and
  provenance. Each recipe carries a visibility flag (Private / Family / Public), and the public
  ones surface in Potluck, an opt-in feed with a public page per cook.
- **The kitchen app** (`kitchen.enamelvault.com`): dish development and sign-off for a
  professional kitchen. A dish goes from development through trial at one site to the group
  menu, every revision kept, one version signed off, and an owner can publish the approved
  version to Potluck under the venue's name.

They **share no data**: the kitchen's tables live in their own Postgres schema, and
`supabase/kitchen_seal.test.ts` fails if either side reaches into the other. A **moderation
console** on `admin.enamelvault.com` is the one sanctioned crossing, and even that reads the
kitchen counts-only through an edge function.

**Live at <https://enamelvault.com>**, which is the marketing surface and the sign-in chooser;
the subdomains are the apps. All of them are served by the same Cloudflare Worker, which
branches on hostname.

## Documentation

| Document | What it holds |
| --- | --- |
| `PRODUCT.md` | Who it is for, the product decisions, the roadmap, and what is deliberately deferred. Not in this repo: it is gitignored, because the roadmap is not something a public repository needs to publish |
| [DESIGN.md](DESIGN.md) | The Enamel Vault design system: tokens, type, colour, components |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Running it locally, verifying, CI, deploying, secrets, monitoring, environment traps |
| [docs/superpowers/specs/](docs/superpowers/specs/) | Per-feature design specs, newest first |

`HANDOVER.md` is local-only and gitignored: it holds current session state, nothing durable.

Engineering lessons are **not** kept in this repo as prose. A rule about specific code lives as a
comment at that code, where it cannot be missed; the generalisable half lives in the Obsidian
vault (`Projects/FamilyRecipes/`), which spans every project. See `CLAUDE.md`.

## What it does

### The family app

- **Multiple families per user**: belong to several, switch between them, and invite people
  with a link you can send rather than a code they have to type.
- **Rich recipes**: ingredients, steps, servings, times, tags, photos, plus a story and
  provenance ("from Grandma, adapted by Mom").
- **Easy entry**: a guided manual form, or AI pre-fill from pasted text, a URL, a photo of a
  handwritten card, voice, or freeform writing. The AI drafts; you always review before saving.
- **Optional ingredients and alternatives**: mark something optional, or as a swap for another
  ingredient. The grocery list buys one of a swap pair, never both.
- **Per-recipe visibility**: Private / Family / Public.
- **Drafts**: save an unfinished recipe and come back to it, including one the AI pre-filled.
  A draft belongs to its author alone and is never a row in `recipes`. A pending edit to an
  already-published recipe is a draft too: the recipe stays untouched until you publish, and if
  someone else changed it meanwhile you are told and asked, rather than silently overwriting.
- **In-family comments** and **Cook Mode**: one step at a time in big text, the screen kept
  awake, and the step itself is the tap target because cooking hands are rarely clean. The
  ingredients that step mentions sit under it with the amounts already scaled, the full list
  sits beside the step rather than on top of it, you can tick an ingredient off as you add it,
  and the step number is in the URL so a reload does not lose your place. It can also read the
  step and its scaled amounts aloud, off by default and toggled in the bar.
- **Potluck**: a signed-in space for other households' public recipes, with search, a public
  cook page per handle, and following. Saving a copy into your own vault keeps the original
  cook's attribution, and the copy survives the original being unpublished or deleted.
- **My Kitchen**: meal planning on a day-by-slot week grid (drag a meal's grip, or tap to
  assign), leftovers that fill a slot without buying twice, and a grocery list built from the
  plan, grouped by supermarket aisle and scaled to each plan item's servings.
- **The cupboard**: what you already have, so the grocery list stops telling you to buy it.
  Add staples by typing or from the ingredient catalog, and tag an aisle for anything the
  catalog cannot place, from whichever screen you noticed it on.
- **Sign-in** with a verified email address or with Google.

### The phone app

An Expo / React Native client for the family app, in `mobile/`. It exists for the four things a
browser tab cannot do: work with no signal, live in the share sheet, ring with the screen off,
and reach the camera and microphone properly.

- **Offline first**: the shelf, the recipe, and editing all read and write a local SQLite store,
  with the sync state visible (what is here, what is queued to send, when it last caught up). A
  queued edit that meets a recipe which moved underneath it gets a conflict screen rather than a
  silent overwrite.
- **Cook Mode with timers that ring while the phone is locked**, which is the one thing the
  web app cannot do.
- **Sign-in with email, Google and Apple**, against the same Supabase as every other client.

It is a client for the family app only: the kitchen app and the console stay web-only, and
`supabase/kitchen_seal.test.ts` holds that line for the phone app too.

### The kitchen app

- **The dish pipeline**: development, trial at one site, then the group menu, with every
  revision kept and one version signed off. An owner can publish the approved version to
  Potluck under the venue's name.
- **Reversible housekeeping**: a dish can be retired and a site closed, both undoable, and an
  owner can erase the whole group, which takes its published dishes down first.
- **Numbers**: whether dishes land and how long they take, where the group stalls, and which of
  its sites record anything, for an owner or a chef. An owner alone also sees who has been back,
  which the kitchen privacy page and terms both disclose.

It is `noindex`, enforced by a `robots.txt` and an `X-Robots-Tag` header rather than a meta tag
alone, since the crawlers that matter never run the page; `worker/kitchen.ts` carries the
reason, which changed on 2026-10-15 even though the rule did not. `/professional` on the bare
domain is therefore the kitchen's only indexable surface.

### Across the products

- **Moderator console** on its own host, `admin.enamelvault.com`, in six sections: the report
  queue, appeals, a **Recipes** section of counts and first-party numbers (who comes back, where
  people fall out of onboarding, which features are used, which marketing page produced an
  account), a **People** roster with suspend, take down, grant moderator and delete, a
  **Kitchen** section that counts the other product and reports its throughput (dishes started
  and signed off, the median days to sign-off, how many have been in development over a month,
  and how many staff were active in the last seven days, as a count that never names anybody),
  and a **Trail** of every moderator action with its author. Visible only to a moderator, and
  the page re-checks that rather than relying on the nav hiding the link.
- **Public documents**, readable without an account: terms, privacy policy, cookies, and help
  (`/terms`, `/privacy`, `/cookies`, `/help`). The kitchen app has its own `/terms` and
  `/privacy`, a different product with different parties, and its own acceptance gate. There is no cookie banner because the only cookie the app sets is the one that keeps you
  signed in across its three hosts, which is strictly necessary and therefore exempt from
  consent. `src/lib/browserStorage.test.ts` allows that one file by name and fails the build on
  any other cookie, which enforces it rather than promising it. **Things ARE counted**, and saying otherwise here was wrong
  until 2026-10-16: Cloudflare counts page views cookielessly, and a signed-in account's use
  is recorded as one dated row per section per day so the project can tell whether anyone
  comes back. Both are described on `/privacy` and `/cookies`, neither touches the device, and
  that is why no banner is required.

## Stack

- React on the web, and React Native (Expo) on the phone, over the same Supabase.
- Supabase: Postgres, Auth, Storage, and Row-Level Security enforcing the visibility model.
- Four Supabase Edge Functions: `extract-recipe` (AI recipe structuring), `delete-account`,
  `notify-report` (emails the moderation queue through Resend), and `admin` (the moderator
  console's backend, which needs the service-role key and so cannot live in the browser).
- Cloudflare Workers serves the built frontend and, because a crawler never runs the SPA,
  everything a crawler has to see in the HTML: a self-referencing canonical and its own title
  on every route, per-recipe OpenGraph tags, a cook's own name on `/cooks/:handle`, the four
  public documents' prose rendered at build time and injected into `#root`, proxied preview
  images and avatars, JSON-LD recipe data, `/sitemap.xml`, and two health routes: one for
  the extract function, one reporting the commit the Worker was built from.

Designed for portability: **all data access is isolated in `src/lib/api/`**, and nothing outside
it imports the Supabase client, so moving to a self-owned Node/Express + Postgres backend later
is a bounded swap.

This repo builds **three web apps from one Worker**: the family app (`index.html`, `src/`) on
`recipes.enamelvault.com`, the kitchen app (`kitchen.html`, `src/kitchen/`,
`src/lib/api/kitchen/`) on `kitchen.enamelvault.com`, and the moderation console
(`admin.html`, `src/admin/`) on `admin.enamelvault.com`, plus three static marketing pages on
the bare domain (see below). The phone app (`mobile/`) is a fourth client, built with Expo and
shipped through EAS rather than by the Worker. The three web apps share one sign-in, through a
cookie on `.enamelvault.com`. The family and kitchen apps share tokens, presentational
components and the auth plumbing, and share NO data: the kitchen's tables live in their own
Postgres schema and `supabase/kitchen_seal.test.ts` fails if either side reaches into the
other.

### The marketing pages on `enamelvault.com`

Three static pages, served by the Worker from `public/`, listed in `SITE_PAGES` in
`worker/site.ts`. That map is the single source: the sitemap and the `robots.txt` disallow
lines are both generated from it, so a page cannot be announced without existing or exist
without being announced. Each `.html` filename is refused as a public path, so every page has
exactly one URL and that URL is its canonical.

| URL | File | What it is |
| --- | --- | --- |
| `/` | `public/site.html` | The hub. Belongs to neither product; links to both pages and carries the rack of public recipes |
| `/family` | `public/family.html` | The family app's case, and its sign-up |
| `/professional` | `public/professional.html` | The kitchen app's case, and its sign-up. This is the kitchen's ONLY indexable surface, because `kitchen.enamelvault.com` is `noindex` |

They share `public/site.css`. Anything else they reference must be in `isSiteAsset()`, or the
bare host redirects it to the app host, which makes it cross-origin and the CSP refuses it
**silently**; `src/site.assets.test.ts` is the guard, written after exactly that shipped.

Four tests run over all three pages from a list: `site.a11y` (structure, distinct titles and
canonicals, no inline script, hub neutrality), `site.assets`, `site.tokens` (palette drift)
and `site.claims` (no claim the kitchen terms disclaim). **Adding a page means adding it to
those lists**, or it ships unchecked.

## Quick start

Docker must be running.

```bash
npx supabase start
```

```bash
npm run dev
```

Full setup, environment variables and the verify commands are in
[docs/OPERATIONS.md](docs/OPERATIONS.md).

## Roadmap

Shipped, newest first: the phone app (an offline shelf and recipe, editing with no signal, a
conflict screen, and Cook Mode with timers that ring locked) · one sign-in across all three
hosts, and the moderation console moved to its own host with its own door · an audit trail
naming the author of every moderator action · Cook Mode reading the step aloud · the public documents and the WCAG AA contrast and
labelling fixes · the kitchen app (the dish pipeline, Numbers, its own host and its own
Postgres schema) · search-engine indexing (robots, sitemap, canonical, JSON-LD) · moderation, reporting and
takedown · save and fork with attribution · Potluck, the public feed (browse, search, follow) · public identity and
public cook pages · optional ingredients and alternatives · week-grid drag and drop · error
and uptime monitoring · verified email and Google sign-in · the cupboard and "cook now" ·
ingredient aisles · My Kitchen week grid · recipe enrichment and grocery scaling · My Kitchen
meal planning · v1 private multi-family vault.

Next: opening Potluck beyond signed-in users, which moderation and the public documents now
unblock, and then costs for the kitchen (yield, portion cost, supplier, allergens) in their
own sidecar table.

Later: LLM / entity canonicalization for ingredients, and a family-editable ingredient
catalog. Per-recipe link previews are already built, in the Worker.

`PRODUCT.md` has the detail, including what is deferred and why. It is deliberately not published here.
