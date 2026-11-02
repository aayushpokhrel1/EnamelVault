# Working in this repo

## Where things are written down

**Before adding anything to `HANDOVER.md`, ask: will this still be true in a month?**
If yes, it belongs in a permanent doc below, not in the handover. This file exists because every
session was putting everything in `HANDOVER.md` until it reached 1,365 lines and started
contradicting itself, which caused real wrong work: a superseded line led to re-proposing a
model swap the same file recorded as already tried and rejected.

| Write it in | When it is |
| --- | --- |
| `README.md` | What the app is, what it does, the stack, links to everything else |
| `PRODUCT.md` | Product truth: who it is for, decisions, roadmap, what is deferred **and why**. **Gitignored since 2026-10-02**: the repo is public and the roadmap is the part worth keeping back. The canonical copy is in the vault at `Projects/FamilyRecipes/product/PRODUCT.md` |
| `DESIGN.md` | The visual system: tokens, type, colour, component patterns |
| `docs/OPERATIONS.md` | Running, verifying, CI, deploying, secrets, monitoring, environment traps, latent landmines |
| a **code comment at the site** | A rule about specific code ("any new ingredient column must be added here too") |
| the **Obsidian vault** | A lesson that would change how I work on a *different* project |
| `docs/superpowers/specs/` | The design of one feature, written before building it. Still tracked: a spec explains why the code is shaped as it is |
| `supabase/kitchen_seal.test.ts` | The rule that the professional kitchen's schema touches the family's in a named, short list of bridge migrations. There are THREE now (`0044`, `0045`, `0051`). Adding a fourth is a deliberate act: write the reason in the migration's own header, as `0051` does |
| `supabase/deletion_parity.test.ts` | The rule that both account-deletion paths erase the same columns. They drifted once: `0014` said the flow left "no identity", `0020` added three identity columns, and only the moderator path was updated, so self-deleted cooks stayed in `public_cooks` |
| `docs/superpowers/plans/` | The task breakdown for one feature. **Gitignored since 2026-10-02**, same reason as `PRODUCT.md`; canonical copy in the vault at `Projects/FamilyRecipes/plans/` |
| `HANDOVER.md` | **Only** current state: commit, versions, test counts, what is half-done, what is next |
| nowhere | A dated narrative of what you did today. `git log` already holds it, in detail |

`HANDOVER.md` is gitignored and local-only, so nothing durable may live there: a fresh clone or
another machine would never see it.

## Lessons have ONE home each, by reach

There is deliberately **no `LESSONS.md` in this repo**. It was tried on 2026-09-27 and deleted
the same day, because every entry was already a third copy: the codebase-specific ones were
comments at the code, and the generalisable ones were in the vault.

1. **A rule about specific code goes in a comment AT that code.** This is the most reliable form
   by a distance: you cannot edit `replace_recipe_children` without reading the warning above it.
   A doc elsewhere is the least reliable, because nobody re-reads it.
2. **A lesson that generalises goes in the Obsidian vault**, `Projects/FamilyRecipes/index.md`,
   phrased so it is useful on another project, with this one as the example.
3. **Nothing goes in both.** If something is genuinely both, the detail is the code comment and
   the generalisable half is the vault note.

The evidence for why prose docs do not work here: three bugs on 2026-09-27 had their lesson
already written down in this project before they happened. **The failure mode is not ignorance,
it is not re-reading.** Prefer a mechanical defence (a test that fails, a CI job, a grep, a
comment you cannot avoid) over a document.

**Use `/update-docs-familyrecipes`** (`.claude/commands/update-docs-familyrecipes.md`) rather
than re-deriving the sweep. There is also a user-level `/update-docs` holding the generic
discipline for every project; **this repo's is the one to run here**, because it carries the
real commands (`npx supabase migration list --remote`, `/health/version`) and this repo's file
routing. The names are deliberately different: they were both `update-docs` for an hour, and the
user-level one won, so the repo-specific procedure never loaded.
It holds the measurements to run, the routing table to route each fact by, and the specific
bloat to hunt. Two mechanical defences back it up, because a doc asking for brevity does not
get it: `src/handover.budget.test.ts` fails when `HANDOVER.md` goes over 200 lines or grows
dated section headings, and the answer when it goes red is to MOVE content to its home, never
to raise the budget.

**Updating docs means making them TRUE, not just appending what shipped.** Correct or strike a
stale claim where it sits rather than adding a newer entry beneath it, because the next reader
may hit the old one first. Cross-check every number (deployed version, test count, head commit)
against reality rather than trusting the file.

When asked to "update the docs", sweep all of them, not the one you happen to have open.

## The public documents, and the tests that keep them honest

`/terms`, `/privacy`, `/cookies` and `/help` are public routes, deliberately outside
`RequireAuth`: a notice you can only read after consenting is not a notice. They render
`<div className="prose plate">`, and **both classes matter**, because `.plate` carries the rule
that recolours headings. A `.prose` that styled its own surface without being a `.plate` put
bone headings on a bone plate, which is invisible, and no test caught it.

Each page makes a claim that the code has to keep true. Three tests do that, and each was
confirmed to go red before it went green:

| Test | What it stops |
| --- | --- |
| `src/index.contrast.test.ts` | A colour pair dropping below AA. It reads the REAL tokens out of `index.css`, so it cannot drift from the palette |
| `src/lib/accessibility.test.ts` | A missing `alt`, an unlabelled form control, a `<div onClick>`, an icon-only button |
| `src/lib/browserStorage.test.ts` | A cookie, a tracker, or a new storage key appearing, which is the exact moment a consent banner becomes legally mandatory |

Both of those used to have no mechanical guard. They do now:

- **`TERMS_VERSION` in `TermsGate.tsx` must be bumped when `Terms.tsx` wording changes**, or
  nobody is re-asked and the stored acceptance is a lie.
  `src/components/TermsGate.version.test.ts` fingerprints the page and fails if the wording
  moved without the version.
- **A terms guard watches the TERMS page and nothing else.** The three dated pages with no gate
  (`src/pages/Privacy.tsx`, `Cookies.tsx`, `src/kitchen/pages/Privacy.tsx`) are guarded
  separately by `src/pages/legalDates.version.test.ts`, which fails when their wording moves
  without their `*_UPDATED` constant in `src/lib/legal.ts`. **A change to a privacy page alone
  therefore leaves every terms test green and re-prompts nobody**, which is correct for a
  typo and wrong for a material change: on 2026-10-21 a clause saying an employer can see a
  person's attendance went in that way, and the re-prompt happened only because the kitchen
  TERMS page gained the clause too. Decide which it is; the mechanism will not decide for you.
- **`Privacy.tsx` must name every third party the app sends data to.** Adding an outbound call
  anywhere makes that page part of the change. `docs/OPERATIONS.md` has the current list, and
  `supabase/processors.test.ts` fails the build if a provider the code can reach is unnamed.

**The kitchen app has its own two documents and its own gate**, and the same rules apply to
them separately: `KITCHEN_TERMS_VERSION` in `src/kitchen/components/KitchenTermsGate.tsx`,
`KITCHEN_TERMS_UPDATED` in `src/lib/legal.ts`, and
`src/kitchen/components/KitchenTermsGate.version.test.ts` holding both. The versions are
deliberately separate: a kitchen clause must not re-prompt every family cook, and the kitchen
app cannot reach `lib/api/profile.ts` anyway, so its acceptance lives in
`kitchen.terms_acceptance` (`0046`).

**Both apps have a `pages/Terms.tsx`.** Pass a FULL path to `sourceText` in
`src/lib/termsFingerprint.ts`: a bare suffix matches both and throws on purpose, because the
glob sorts the kitchen one first and the family guard would otherwise have begun hashing the
wrong document, failing once and then passing forever while guarding nothing.

## Project rules

- **All Supabase access lives in `src/lib/api/`.** Nothing outside it imports the client. This
  is the portability seam for a future Node/Express + Postgres backend.
- **Verify with `npx tsc -b && npm test`**, not `tsc --noEmit`. DB or migration changes also
  need `npx supabase db reset` (requires Docker).
- **The Worker, not the SPA, is what search engines and link previews see.** `robots.txt`,
  `/sitemap.xml`, canonical URLs, OpenGraph tags and JSON-LD all live in `worker/`, so none of
  them work under `npm run dev`. Pure helpers go in `worker/meta.ts` and are unit tested;
  `worker/index.ts` does the I/O and must always degrade to serving the untouched asset.
- **Apply a migration to cloud BEFORE the frontend that needs it.** A frontend commit and its
  migration are not one change: Cloudflare deploys one automatically and Supabase deploys
  neither. Getting this backwards broke every recipe save on production once already.
- **No edge function is ever deployed automatically.** There are four now, and each deploys on
  its own: `npx supabase functions deploy <name>` for `extract-recipe`, `delete-account`,
  `notify-report` or `admin`. `ACTIVE` means deployed, not runnable.
- **RLS is the entire security model, and a test now holds it.** `supabase/rls.test.ts` reads
  the migrations and fails if a table is created without `enable row level security`, without a
  policy, or if a `SECURITY DEFINER` function omits `set search_path`. A table that misses RLS
  is readable and writable by anyone holding the anon key, which ships in the JS bundle on
  purpose. `extract_log` is listed there as deliberately unpoliced, because RLS with no policy
  is the strictest setting, not a gap.
  **A new table in the `kitchen` schema also needs its own `grant`, in its own migration.** A
  new schema is granted to nobody, and `0039`'s schema-wide grant only covers the tables that
  existed when it ran, so without one every call fails with `42501` while the policies look
  perfect and the negative tests pass for the wrong reason: the caller is refused by the
  missing grant rather than by the policy. `0046` shipped without it for as long as it took
  `rls.test.ts` to name the table, and that check had to be tightened to catch it at all.
  **A static check proves a policy EXISTS, never that it is CORRECT**, and a 2026-10-12 audit
  found six holes where the policy existed and read perfectly. Two more locks in
  `rls.test.ts` close the shape all of them shared:
  - **Write `with check` on every `for update` and `for all` policy, even when it repeats
    `using` word for word.** Postgres silently reuses `using` as the check when it is omitted,
    so the policy constrains which rows you may TOUCH and nothing about what you may turn them
    INTO. `profiles_self_update` was correct in `0002` and became a one-request path to
    moderator the day `0028` added `is_moderator` to the same table. Nobody reopens a policy
    when they add a column, so the omission has to be unshippable instead.
  - **A `SECURITY DEFINER` function taking a `uuid` must tie it to `auth.uid()`**, directly or
    through a caller-identity helper. It bypasses RLS by definition, so an id parameter it
    never checks is an oracle whose subject the caller picks. `blocked_between` carried a
    comment saying it was safe because it never reveals who blocked whom, which held only
    while the app chose the arguments.
  **A gate whose left side can be NULL is not a gate.** A full audit on 2026-10-12 found the
  run's only HIGH here: `kitchen.staff_role(org)` is a bare SELECT, so it returns NULL for a
  non-member, and four pipeline functions wrote `if staff_role(...) not in ('owner','chef')
  then raise`. `NULL not in (...)` is NULL, and plpgsql skips an `IF` body whose condition is
  NULL, so the raise never fired for the caller with no authority at all. **While employed on
  the lowest role a user was correctly refused; once their staff row was deleted the same
  user could sign a dish onto the live menu. Offboarding increased their authority.** The
  direction is what matters: `if role = 'owner' then <work>` fails CLOSED and is fine, a
  negated test guarding a refusal fails OPEN. `coalesce` it, or use `is distinct from`.
  This was the SECOND instance of the class: `0047` nearly shipped `hidden_from_feed`
  returning NULL into a policy consumed behind `not`. `rls.test.ts` now fails both shapes.
  **A new function in the `kitchen` schema also needs its EXECUTE revoked, AND the re-grant
  that follows it.** `0039`'s `grant on all functions` covered only what existed then, so
  everything added in `0040`-`0046` kept Postgres's default of EXECUTE to PUBLIC while anon
  held schema USAGE. That is what made the NULL gate reachable rather than merely wrong. The
  trailer every migration since `0049` ends with is three lines and all three are load-bearing:
  revoke from `public, anon`, re-grant to `authenticated, service_role`, then re-grant
  `peek_invite` to `anon`. Blanket, because that is the only form covering the function nobody
  has written yet. **Omit the re-grant and every signed-in caller gets `42501`**, because
  `authenticated` reached the new function through the PUBLIC grant the revoke just removed:
  `0063` shipped with two targeted revokes and its own integration tests caught it. Copy the
  trailer from the previous migration rather than writing a narrower one.
  **The real proof lives in `tests/integration/`, not here.** Those run as an ordinary user or
  as anon against a real database, and they are the only thing that can tell a correct policy
  from a present one. `audit_2026_10_12.test.ts` attempts all six exploits. Set the policy up
  with `admin` if you must, but never ASSERT through it: the service role bypasses RLS, so an
  assertion made through it passes however broken the policy is.
- **A WRITE REFUSED BY RLS IS NOT AN ERROR, so every control must be checked against its
  policy before it is rendered.** A policy does not reject a row, it fails to match one: an
  `update` or `delete` the database declines affects zero rows and resolves with `error: null`.
  Three bugs came from this in one day (`f4d720b`, `c869926`, and the comment thread), and the
  shape is always the same, a table whose READ rule is wider than its WRITE rule, which is what
  every sharing feature creates:

  | Table | Who may read | Who may write |
  | --- | --- | --- |
  | `recipes` | public, or any family member | the author, or the family's owner |
  | `meal_plans`, and both item tables | any family member of a SHARED plan | the plan's owner |
  | `comments` | any family member | the author |
  | `recipe_photos` | anyone who can read the recipe | the author |
  | `families` | any member (including `invite_code`) | the owner |
  | `appeals`, `reports` | the subject, or a moderator | nobody, except through an RPC |

  Two rules fall out, and both have a test now rather than a comment, because this exact
  mistake shipped three times with the lesson already written down beside the first one:
  **a page must not render a control its viewer's policy will refuse** (`canEdit` on
  `RecipeDetail` and `MealPlanDetail`, `author_id === userId` in `CommentThread`), and **every
  write in `src/lib/api/` must `.select()` what it wrote and throw when nothing comes back**.
  `tests/integration/silent_refusals.test.ts` pins what the database actually does, so neither
  guard can be removed on the belief that an error would be raised.

  **`SELECT ... FOR UPDATE` is the exception worth knowing**: a locking read applies the UPDATE
  policy, so it refuses early and loudly. That is why `publish_recipe_edit` was safe while the
  plain client call next to it was not, and why removing a `FOR UPDATE` to tidy a function can
  quietly open it.

- **A new foreign key to `auth.users` needs an `on delete` action, or it is a veto on account
  deletion.** Postgres defaults to NO ACTION, so an attribution column (`created_by`,
  `approved_by`, `published_by`) silently refuses to let the login go. Eight of them in
  `kitchen` meant anyone who had worked in a kitchen could not delete their account, and
  because `delete-account` blanks the profile FIRST and removes the login LAST, the refusal
  landed with the identity already erased and the login still live. `set null` keeps the record
  and drops the person; `cascade` is the other acceptable answer. `supabase/rls.test.ts` fails
  on a new column without one, and `tests/integration/kitchen_account_deletion.test.ts` deletes
  a user who has worked in a kitchen. Note what did NOT catch it: `deletion_parity.test.ts`
  compares the two deletion paths with each other, and they agreed.

- **A view has no row-level security, and a privilege nobody granted is still a privilege.**
  `public_cooks` and `public_recipe_bylines` read `profiles` past its policies ON PURPOSE, which
  is correct for SELECT. They are not `security_invoker`, so they run as their owner with RLS
  off, and a view over one table is auto-updatable. Supabase's `alter default privileges` had
  granted anon ALL on both, so anyone with the publishable key could rewrite or delete any
  published cook's row over HTTP until `0056` revoked it. **Any new view needs its write
  privileges revoked in the same migration** (`supabase/rls.test.ts` fails without it), and
  `grep grant` over the migrations can never tell you what a view actually holds: read
  `information_schema.role_table_grants`.

- **The Worker sends a Content-Security-Policy with `script-src 'self'`, so NO inline
  `<script>` runs.** A blocked inline script does not warn, it silently never executes, which
  is why the theme bootstrap lives in `public/theme-init.js`. `worker/meta.test.ts` pins the
  policy and `src/lib/browserStorage.test.ts` fails if an inline script returns to
  `index.html`.
- **The link-preview card is GENERATED, not hand-drawn.** `scripts/og-card.py` draws
  `public/og.png` from the DESIGN.md tokens and the mark in `public/favicon.svg`. It was made
  by hand once and drifted: the card shipped for weeks carrying a mark that `favicon.svg` had
  already rejected in its own comment. **After redrawing it, bump `OG_CARD` in
  `worker/meta.ts` and the `og:image` in `index.html`**, or every platform keeps serving the
  cached old picture.
- **A route that DOES something belongs behind a terms gate, even when it is public.** The four
  public documents are outside it on purpose, because a notice you can only read after
  consenting is not a notice; `join/:code` is public but gated, because joining a family is an
  action. `src/routes.terms.test.ts` reads `routes.tsx` and fails if an action route escapes.
  **There are THREE routers and each needs its own guard**: that test read only the family's,
  and the kitchen app shipped its entire surface ungated with the suite green, because a guard
  covering one of several apps reports success for the app it cannot see. The console
  (`src/admin/routes.guard.test.tsx`) is the third, and what it asserts is deliberately NOT
  terms: that app has no terms gate because it is an operator tool, so its guard holds the
  analogue, that no route escapes the gate it DOES have, which is the moderator check.
  `src/kitchen/routes.terms.test.tsx` now reads the kitchen's, which is structured as three
  bands (auth pages, the two documents, then everything inside one `GatedLayout`).
- **Anything that must survive signing in goes in the URL, never in router state.** Three of
  the four ways into this app leave the page: Google redirects through another origin, and an
  email confirmation link is opened later, often in another tab. `src/lib/nextPath.ts` is the
  single place that builds and validates `?next=`, and `safeNext` is a trust boundary, not a
  tidy-up: without it the sign-in page is an open redirector. The hosted Supabase redirect
  allow list needs a GLOBSTAR entry for `/auth/callback**`, or it silently substitutes the
  Site URL and the whole mechanism is inert; `docs/OPERATIONS.md` has the measurement.
- **This repo holds THREE apps.** The family app is `index.html` plus `src/`; the
  professional-kitchen app is `kitchen.html` plus `src/kitchen/` and `src/lib/api/kitchen/`,
  on its own host and in its own Postgres schema; the moderation console is `admin.html` plus
  `src/admin/` on `admin.enamelvault.com`. **The family and kitchen apps share no data**; the
  console reads the family's and reaches the kitchen's only counts-only through the `admin`
  edge function, which stays the single sanctioned crossing.
  **All three share ONE SESSION** since 2026-10-26: it lives in a cookie on `.enamelvault.com`
  (`src/lib/sessionCookie.ts`), not in `localStorage`, so one sign-in covers all of them. The kitchen app may
  import `auth.ts` and `kitchen/*` from `src/lib/api/` and nothing else, and `auth.ts` must
  stay free of family imports; `supabase/kitchen_seal.test.ts` fails on either, and on any
  migration outside its named bridge inventory that reaches across. **It follows transitive
  imports now**, so reusing a shared component that itself imports a family data module fails
  too, which is exactly what reusing `TermsGate` from the kitchen app would have done while the
  old direct-only check reported success. **Kitchen code lives under
  `src/` on purpose**: `npm test` runs `vitest run src supabase worker scripts`, so a
  top-level directory would hold tests that never run.
- **Only use CSS class names `src/index.css` actually defines.** A missing class fails nothing
  and renders unstyled, which the kitchen shell shipped once with an invented
  `appbar`/`wordmark`/`muted`.
- **Work on `master`** (solo project). Branch only to let CI gate something risky first.
- **Query the Obsidian vault (`Projects/FamilyRecipes/`) before a big change**, and read
  `docs/OPERATIONS.md` before any deploy. Most vault entries name a bug that recurred *after*
  its lesson was first written down.
