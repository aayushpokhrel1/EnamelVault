# Operations

How to run, deploy and not break Family Recipes. Cross-cutting engineering lessons live in the Obsidian vault
(`Projects/FamilyRecipes/`), not in this repo; product truth lives in `PRODUCT.md`, which is gitignored and kept in the vault.

## Running it locally

Docker must be running for anything DB-related.

```bash
npx supabase start
```

```bash
npx supabase db reset
```

`db reset` applies every migration from scratch. Frontend config goes in `.env.local`
(gitignored):

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local ANON_KEY from npx supabase status>
```

Then `npm run dev`. `.claude/launch.json` exists, so `preview_start name:"dev"` works.

`enable_confirmations = true` is set in `supabase/config.toml`, so a locally created account
needs its confirmation link from Mailpit (<http://127.0.0.1:54324>). Users created through the
admin API with `email_confirm: true` skip that.

AI extraction locally:

```bash
npx supabase functions serve extract-recipe --env-file supabase/functions/.env
```

`supabase/functions/.env` (gitignored) holds `MODEL_*` and `TRANSCRIBE_*`.

## Verifying a change

```bash
npx tsc -b && npm test
```

Use `npx tsc -b`, **not** `tsc --noEmit`. DB or migration changes additionally need
`npx supabase db reset`.

**`tsc -b` deliberately excludes `supabase/functions/`** (they are Deno: remote URL imports,
`Deno.serve`, `.ts` specifiers), and `functions deploy` does not typecheck either, so a bad
file there ships silently and answers 503 BOOT_ERROR on every mode at once. That happened once
from a duplicate `const body`. `npm test` covers it now:
`supabase/functions/extract-recipe/boots.test.ts` parses AND binds every file in that
directory, and two of its own tests prove it can go red. Before 2026-09-30 a comment in
`index.ts` claimed that guard existed while nothing in the suite read the directory at all, so
if you add another edge function, give it the same test rather than trusting the deploy.

**The local edge runtime does not come up on this machine, so an edge function cannot be
EXERCISED locally at all.** `supabase start` reports `supabase_edge_runtime_EnamelVault`
under "Stopped services" on every run, even though `config.toml` has `[edge_runtime] enabled
= true`, and `functions.invoke` from a test answers 503 through Kong. So an integration test
must not try to call one: it will fail for an environment reason that looks exactly like a
code bug. This was hit on 2026-10-12 writing a regression test for the `delete-account` fix.

The consequence is a real coverage ceiling worth knowing before you trust a green suite:
**the four edge functions are covered only by a parse-and-bind test and by static checks of
their source.** Where a fix lives inside one, guard it statically instead. `delete-account`'s
fix is held by `supabase/deletion_parity.test.ts`, which compares its blanked column set
against `admin`'s and against what `public_cooks` exposes, and the integration suite asserts
the database invariant rather than pretending to call the function. That file now also holds
the ROWS each path deletes and the buckets it clears, not only the blanked columns: on
2026-10-13 both paths were found leaving a deleted cook'''s drafts, follows and avatar FILE
behind, and a parity test that measures one dimension is satisfied by both paths being wrong
together in another.

Integration tests need three env vars the script does not inject, mapped from
`npx supabase status -o env`:

| export | from |
| --- | --- |
| `SB_URL` | `API_URL` |
| `SB_ANON_KEY` | `ANON_KEY` |
| `SB_SERVICE_KEY` | `SERVICE_ROLE_KEY` |

Without them every integration file fails with "supabaseUrl is required", which is a missing
export and not a code bug.

```bash
npm run test:int
```

### Trust a foreground test count, never a backgrounded one

A `npm test` that is moved to the BACKGROUND mid-run can report a **reduced file and test
count and still exit 0**, which reads exactly like tests having been deleted. A foreground
re-run reports the full set, and so does a non-TTY run (`npm test > file`), so CI's discovery
is unaffected. It is the harness, not the suite.

This matters because the counts in `HANDOVER.md` are supposed to be measured, and a
backgrounded run will quietly talk you into writing down a smaller number than the truth.

### A browser walk poisons the integration suite, and it looks like flakiness

**Run `npx supabase db reset` before the integration suite if you have been clicking around
the app.** Accounts made by hand for a browser walk stay in the same local database the
integration tests run against, and several of those tests assert invariants over the WHOLE
database rather than over rows they created.

Measured on 2026-10-15. After a walk that created two accounts, an org, a site, a dish and an
invite, two consecutive full runs each reported `224 passed | 1 failed` with a DIFFERENT test
failing each time, and each of those tests passed when run on its own. That reads exactly like
a timing flake and is not one. After `npx supabase db reset` the same suite was 225/225.

The two that happened to fail were the whole-database ones, which is the tell:
`audit_2026_10_12_full.test.ts` "holds the invariant that a profile with no login has no public
identity", and a `kitchen_invites.test.ts` case. Anything that scans rather than scopes is a
candidate.

**A browser walk is not the only way to poison it. THE SUITE POISONS ITSELF.** Measured on
2026-10-26, with no browser walk involved at all: four full integration runs back to back, no
reset between them, and the fourth failed `audit_2026_10_12_full.test.ts` with nineteen orphaned
`public_cooks` rows, every one of them a random handle the tests had generated themselves. The
deletion tests leave a profile whose login is gone, which is exactly the state that invariant
exists to catch, so each run leaves a little more of what the next run scans. `db reset` and the
same suite was 300/300.

So the heading above is too narrow and the habit it asks for is the right one: **reset before a
full integration run, not only after clicking around.**

So a red integration run is three questions, in this order: are the three env vars exported,
has this database been walked OR run against since its last reset, and only then is it the code.

**One more that is NOT in that list, because it is not a poisoning:** on 2026-10-26 a full run
reported `39 passed (39)` and `283 passed` when forty files exist, having silently not collected
the slowest file. Nothing was red, so a grep for `FAIL` saw a clean run. **Check the file COUNT,
not just the colour**: forty files and three hundred tests is the number, and anything less is a
file that did not run even when everything reported passing.

## Walking production signed in

**Why this is not optional, and not the same as `npm test`.** Every defect found in the last
month came from a browser, not the suite. The three on 2026-09-27 had their lesson already
written down in this repo. The invite link was broken on production for three doors out of four
with 690 tests green. The kitchen walk on 2026-10-11 found three defects no test saw. The suite
proves the rules it was told about; a browser is the only thing that asks whether the page is
the one a person actually gets.

Budget twenty minutes. Do the steps in order: step 3 ends with an account being deleted, and
step 4 is a question you want answered before you have changed anything.

### Step 1: know what you are testing

```bash
git fetch origin && git log --oneline -1 origin/master
```

```bash
curl -s https://recipes.enamelvault.com/health/version
```

Those two must agree. If the Worker is behind, you are about to test the previous build and
conclude something false about this one: wait for the Cloudflare build, or check
`gh run list --limit 1`. This step exists because of the push that never built, which has its
own section above (""Automatic" is not a guarantee").

### Step 2: the restyled Potluck

`https://recipes.enamelvault.com/potluck`, signed in as the real account. Two behaviours are
pinned by tests and must not have been lost. **Both failures look fine**, which is the whole
reason to do this by hand.

1. **Bylines come from ONE `getBylines` call per page.** Open DevTools (F12), Network tab,
   filter on `rest/v1`, then hard-reload (Ctrl+Shift+R). Count the requests whose URL mentions
   `public_recipe_bylines`: there must be exactly **one**, not one per card. A regression is
   invisible on a page of six recipes and is a stampede on a page of sixty.
2. **An empty Following list short-circuits.** Switch the feed to Following while following
   nobody. It must say so and show nothing. The failure is falling back to showing
   **everything**, which reads like a working feed and is the exact opposite of what the filter
   means.

Then simply look, at these four things specifically, because they are where a grid restyle
breaks and no test can see it: a phone-width window, a card with no photo, a card with a very
long title, and a byline for a cook with no handle.

**If something is wrong, write it down and stop; do not fix it in the browser.** The fix belongs
in a commit with a test, and the two behaviours above already have tests to extend rather than
to re-invent.

### Step 3: delete the throwaway account left on production (2026-10-10)

**Identify it first, and do not guess.** Supabase dashboard, Authentication, Users, sorted by
created. You are looking for the one created on 2026-10-10 that is not a family member's. Cross
check in the SQL editor before deleting anything:

```sql
select p.id, p.display_name, p.handle, p.public_name, u.email, u.created_at,
       (select count(*) from family_members fm where fm.user_id = p.id) as families
from profiles p join auth.users u on u.id = p.id
order by u.created_at desc limit 10;
```

**Delete it from the app's own Settings page, signed in AS that account. Never from the Supabase
dashboard.** The dashboard removes the auth user and nothing else, and `0014` dropped the
`profiles -> auth.users` foreign key on purpose, so the profile row SURVIVES with its handle,
public name, bio and avatar intact: `/cooks/<handle>` goes on serving them and the sitemap goes
on offering them to crawlers. That is precisely the drift `0052` had to backfill. Settings calls
the `delete-account` function, which blanks all of it in the right order.

**If you cannot sign in as it** (the password is gone and the email is not an inbox you hold),
do by hand exactly what that function does, in this order, and remove the auth user from the
dashboard last:

```sql
update profiles set display_name = 'A former member', avatar_url = null, preferences = '{}',
       handle = null, public_name = null, bio = null
 where id = '<uuid>';
delete from meal_plans     where owner_id    = '<uuid>';
delete from family_members where user_id     = '<uuid>';
delete from recipe_drafts  where author_id   = '<uuid>';
delete from follows        where follower_id = '<uuid>' or cook_id = '<uuid>';
```

The avatar FILE is not the `avatar_url`: delete the `avatars/<uuid>/` objects in Storage too.
`supabase/deletion_parity.test.ts` is what keeps that column list honest, so if it disagrees
with this block, trust the test.

**Then confirm rather than assuming:** `/cooks/<that handle>` must 404, and the handle must be
gone from `https://recipes.enamelvault.com/sitemap.xml`.

### Step 4: the one read-only question only production can answer

Is any REAL cook sitting in the cleared state? The hiding rule was live there for a while
without the banner that explains it, so somebody could be hidden from the catalogue with nothing
on screen telling them why. SQL editor:

```sql
select id, handle, name_cleared_at, name_cleared_reason
from profiles
where name_cleared_at is not null and public_name is null;
```

Zero rows is the answer you want and the likely one, since the only cleared cook so far was a
test account. **A real row is a person to contact, not a bug to fix:** the banner is live now
(`AppLayout.tsx` renders it when `name_cleared_at` is set and `public_name` is null), so they
will see it next time they open Settings, and it names the reason.

### Step 5: record what you found

Put the result in `HANDOVER.md` under "Half-done: the production walk", one line per step,
**including the steps that found nothing**. A step recorded as clean is the only thing that stops the next session
re-walking it, because an unexamined surface and a cleared one look identical in any list.

## CI

`.github/workflows/ci.yml`, on pushes to master and on pull requests. Three jobs:

- **build-and-test**: `npm run lint`, `npm run build`, `npm test` on Node 22.
- **integration**: boots Supabase via `supabase/setup-cli` + `supabase start`, then
  `npm run test:int`. `supabase start` applies every migration on a fresh Postgres, so a
  migration that will not apply cleanly fails here instead of on the cloud.
- **deployed**: push to master only. Polls `/health/version` until production reports the
  commit being tested, and fails after ten minutes. See "Automatic is not a guarantee" under
  Deployment for why this exists.

### A CI failure that is not yours: `supabase start` cannot bind its port

```
failed to bind host port for 0.0.0.0:54322 ... address already in use
Error: failed to start containers
```

Seen once, on 2026-10-12, on a **comment-only** commit. It happens inside `supabase start`,
so no test has run and the failure says nothing about the code. It passed on a plain re-run of
the failed job with no change.

**Read the job list before reading your diff.** If `build-and-test` and `deployed` are green
and only `integration` is red, look at where it died: a container that never started is the
runner's problem, not yours. Re-run the failed job:

```bash
gh run rerun <run-id> --failed
```

If this starts recurring rather than being a one-off, that is the point to fix it properly
rather than to keep re-running, since a flake everyone re-runs by reflex is how a real failure
gets waved through.

`npm run lint` is the **only** check covering `supabase/functions/`. `npm run build` typechecks
the app and deliberately excludes the edge function because it is Deno, and
`supabase functions deploy` uploads source without parsing it. A syntax error there deploys
fine and then fails to boot on every request.

CI only triggers on master pushes and PRs, so a plain feature-branch push fires nothing. To gate
a branch without opening a PR, temporarily add it to `push.branches` (e.g. `'ci/**'`) and strip
that line before merging.

### Reading a CI failure that is not a failure

**A job with `conclusion: cancelled`, an empty `runner_name` and no steps never ran.** It is
not your code. GitHub reports the whole RUN as "failure" when any job is cancelled, so the
mail says CI failed for a job that executed nothing.

This happened repeatedly on 2026-10-05, and GitHub had an open incident saying so: "delays
when assigning GitHub-hosted runners to Actions jobs". Jobs sat queued and were killed at
almost exactly fifteen minutes, twice with the integration job alone and once with both.

How to tell the two apart in one command, rather than guessing from the email:

```bash
gh api repos/<owner>/<repo>/actions/runs/<run-id>/jobs   --jq '.jobs[] | "\(.name): \(.conclusion) runner=\(.runner_name)"'
```

An empty runner means it never started: re-run it (`gh run rerun <id> --failed`), and check
<https://www.githubstatus.com/api/v2/incidents.json> before spending any time on the code. A
real failure names a runner and has steps, and `--log-failed` prints something.

The workflow sets `concurrency: ci-${{ github.ref }}` with `cancel-in-progress`, so only the
newest commit on a branch is ever queued. That creates no capacity; it stops stale runs
competing for scarce runners, and it means a cancellation is usually one we asked for by
pushing again. **The honest signal while CI is unavailable is the local suite**, which is the
same commands: `npm run lint`, `npx tsc -b`, `npm test`, and `npm run test:int` with the three
`SB_*` variables exported.

## Deployment

Three targets that are deployed **separately**. Confusing them wastes time.

| target | how | automatic? |
| --- | --- | --- |
| Frontend | Cloudflare Workers Builds, Git-connected to master | usually, on push, but **verify** |
| Database | `npx supabase db push --remote --yes` | no |
| Edge function | `npx supabase functions deploy <name> --use-api`, one at a time | **no, never** |

**Pass `--use-api`.** Without it the CLI bundles in a local Docker container, and when the Docker
daemon is unhealthy that step HANGS rather than failing: on 2026-10-26 two attempts sat at
"Bundling Function: admin" for ten minutes each, leaving `edge-runtime` containers in state
`Created` that never started, while `docker inspect` itself timed out. The function stayed on its
previous version with nothing printed to say so. `--use-api` bundles server-side, needs no Docker,
and took about fifteen seconds for the same function.

**That hang does not touch the local database**, because its container was already running. The
thing to expect instead is that anything needing a NEW container, `supabase db reset` included,
hangs until Docker Desktop is restarted. A `docker inspect` that does not return within a few
seconds is the quickest confirmation.

A commit touching only `supabase/functions/` leaves Cloudflare's last build untouched, and that
is correct rather than stale.

### A change that spans all three targets ships in ONE order

Database, then edge function, then frontend. Always that way round, and the reason is not
tidiness: each step is what the next one depends on.

1. **`npx supabase db push --remote --yes`** — tables, columns and functions must exist before
   anything calls them. **`--remote` IS LOAD-BEARING** and the reason is below.
2. **`npx supabase functions deploy <name>`** — one at a time, by name. `ACTIVE` in the
   dashboard means deployed, not current.
3. **Push master**, so Cloudflare builds the frontend that uses both.

**Getting the database last is the expensive mistake, and it is quiet.** A frontend calling a
table or function that does not exist yet fails on every request that touches it. Where the
caller swallows errors by design, as a measurement writer should, nothing is logged and
nothing is recorded, and the first sign is a number that stays at zero. The 2026-10-12
incident below is the loud version of the same class; this is the silent one.

**Getting the function last is narrower and louder:** the page that calls it shows its error.
Whether that takes the rest of the page down with it depends on whether the page loads it
independently, which is the pattern to copy rather than a given.

No deploy order is written here for a NAMED feature on purpose, for the same reason no current
migration number is: a worked example naming a tab, an action and a migration goes stale the
first time any of the three is renamed, and the first attempt at this section managed all
three within a day.

### "Automatic" is not a guarantee: the push that never built (2026-10-12)

**A push can land on GitHub, pass CI, and never produce a Cloudflare build at all.** On
2026-10-12 five commits sat undeployed for over three hours. GitHub had them and CI was green,
so everything that is easy to check said "shipped". The Workers Builds trigger simply never
fired: the build list's newest entry was the PREVIOUS push, no failed build, no notification.

**The failure is silent in the worst way: the old Worker keeps serving 200s.** Nothing is
broken, nothing alerts, and the only symptom is that the change is missing.

**It recurred on 2026-10-26**, on `53efa9a`, which sat undeployed for three hours until the next
push built and carried both commits. **A tempting wrong explanation, now ruled out:** that commit
touched only `CLAUDE.md` and `README.md`, so "Cloudflare skips a docs-only push by design" reads
as the obvious answer. It is false. The very next commit was also docs-only
(`docs/OPERATIONS.md` alone) and built within a minute, measured. There are no build watch paths
doing this; the trigger simply misses sometimes, and a docs-only commit is not exempt from the
alarm going red when it does.

**`ci.yml` does NOT deploy.** It runs `build-and-test` and `integration` only. A green tick on
GitHub says the code is sound, never that it is live. Do not read it as a deploy signal.

**Check that the deploy actually happened, by looking at the deployed Worker rather than at
git.** The fastest honest check is to curl something only the new code can produce:

```bash
curl -s "https://recipes.enamelvault.com/help?cb=$RANDOM" | grep -c "prose plate"
```

Beware a check that can pass on the old code. The first attempt here searched for content
after `<div id="root">`, which matched the closing `</div>` and reported success against an
empty root for three hours. **Grep for a string the new code emits and the old one cannot.**

**To trigger a build by hand** (account `c057c576d1280408b962f56d8b8528e5`, script tag
`f9d5098b1c454b0096c8fd2477509e79`), find the trigger uuid then start it:

```
GET  /accounts/{account}/builds/workers/{script_tag}/triggers
POST /accounts/{account}/builds/triggers/{trigger_uuid}/builds   body: {"branch": "master"}
GET  /accounts/{account}/builds/builds/{build_uuid}              until status is "stopped"
```

The manual build took 36 seconds and deployed correctly, so the build command was never the
problem: only the webhook was. The deploy config itself is intact (`npm run build`, then
`npx wrangler deploy`, branch `master`), which is worth confirming before touching anything,
because **disconnecting the repo in Workers Builds DELETES the build configuration** (see the
environment gotcha below).

### The alarm that now catches it

`/health/extract` could never have caught this, because an outdated Worker is perfectly
healthy. So there is a second health route:

```bash
curl -s https://recipes.enamelvault.com/health/version
```

It returns the commit the deployed Worker was BUILT from. `scripts/stamp-version.mjs` writes
it during `npm run build` from `WORKERS_CI_COMMIT_SHA`, and the `deployed` job in `ci.yml`
polls this route for up to ten minutes after a push to master and **fails the run** when
production is still serving a different commit. A webhook that does not fire is now a red CI
run rather than silence.

Three details that are load-bearing rather than tidy:

- **The route sends `Cache-Control: no-store`, and CI cache-busts anyway.** A cached version
  string is a lie about what is deployed, and this route exists to be trusted when everything
  else looks fine.
- **The stamp lives at `dist/prerender/version.txt`**, so it inherits the two guards that path
  already has: `route()` refuses `/prerender/` publicly and `robots.txt` disallows it. The
  Worker still reads it through `env.ASSETS`, because a Request the Worker builds itself never
  passes through `route()`.
- **The value is shape-checked against `[0-9a-f]{7,40}` or `dev`.** `not_found_handling` is
  `single-page-application`, so a MISSING asset returns `index.html` with a 200, not a 404.
  Without that check a build that failed to stamp would publish the whole SPA shell as its
  version string. `worker/health.test.ts` holds this, and it was confirmed to go red first.

It stamps `dev` on a developer's machine, which can never match a real commit, so a local
build cannot be mistaken for a deploy.

**The job runs on push to master only.** A pull request never deploys, so polling for it would
always fail.

### The exception to "migration first", and what it cost

The standing rule is that a migration reaches cloud BEFORE the frontend that needs it, because
getting it backwards once broke every recipe save on production. **A migration that changes
what a cook SEES, rather than what the frontend may call, inverts that rule.**

`0035_remedies_and_appeals.sql` was the example. It hides a name-cleared cook's public recipes
from Potluck, and the banner explaining that was a later task, so pushing it alone would have
made recipes vanish with nothing on screen saying why. Both halves shipped on 2026-10-02.

**No current migration number is written here on purpose.** This section used to end "cloud is
now at 0038", which was true for nine days and then was not, in the very passage that says a
document can be stale and the remote cannot. Run the command below instead; `HANDOVER.md`
carries current state.

**The part worth keeping: the handover said 0035 was local-only, and it was wrong.** 0035 had
been pushed. A bug was found in it and corrected IN PLACE on the strength of that sentence,
which would have fixed nothing on production while making the local migration history disagree
with what the remote had actually run. `npx supabase migration list --remote` caught it during
the deploy, and the correction became `0036_hiding_rule_is_catalogue_only.sql`.

**So: `npx supabase migration list --remote` is the ONLY authority on what is applied. Run it
before editing any migration file.** If the version appears under `remote`, it is immutable:
write the next number instead. A document, this one included, can be stale; the remote cannot.

The two ordering tests, both of which 0035 hit:

- Does this migration change what someone SEES without the frontend? Then ship them together.
- Does the committed frontend CALL something only the migration creates? Then the migration
  goes first, since Cloudflare builds the frontend by itself on a push to master.

The four functions are `extract-recipe`, `delete-account`, `notify-report` and `admin`.
Deploying one does not deploy the others, and nothing warns you that a function is running
older code than the repo holds.

### Frontend

Live at <https://recipes.enamelvault.com>, with the landing page at
<https://enamelvault.com>. `enamelvault.com` is a Cloudflare zone (Free plan)
and `recipes.` is attached to the `familyrecipes` worker as a **Custom Domain**, so Cloudflare
provisioned the proxied `AAAA` and the certificate itself.

### The console host, added 2026-10-26

`admin.enamelvault.com` is the FOURTH hostname on the same `familyrecipes` Worker and the third
app: the moderation console, which left the family app so that moderating does not require
opening a product the job is not about. Design:
`docs/superpowers/specs/2026-10-26-admin-console-host-design.md`.

**It needs a Custom Domain in the Cloudflare dashboard before it resolves at all**, exactly as
`recipes.` and `kitchen.` did, and that step is MANUAL and deploys with nothing:

1. Cloudflare dashboard, Workers & Pages, the `familyrecipes` Worker, Settings, Domains & Routes.
2. Add a Custom Domain for `admin.enamelvault.com`.
3. Cloudflare provisions the proxied `AAAA` and the certificate itself. Do not hand-create a DNS
   record for it: a Custom Domain and a hand-made record for the same name fight, and the Worker
   is reached through the Custom Domain.

Nothing goes in `wrangler.jsonc`. The custom domains are deliberately not there: a `routes` block
would be a second source of truth for something Cloudflare already holds.

**Until that Custom Domain exists the push is harmless**, which is why the code may ship first.
The Worker's `isAdminHost` never matches, so no branch of it runs and the other three hosts are
untouched. The symptom of forgetting is simply that the hostname does not resolve.

`https://familyrecipes.aayus-pok.workers.dev` was **retired on 2026-10-15** by
`"workers_dev": false` in `wrangler.jsonc`. It had been serving the entire family app as a
second crawlable copy that canonicalised every page to itself and published its own sitemap,
which is the duplicate content the host split exists to prevent. Links already sent to family
pointed at it and now fail rather than redirecting; that was weighed and chosen deliberately
over a redirect. **The custom domain is now the only way in**, so re-enabling this is the
escape hatch if `recipes.enamelvault.com` ever breaks.

Nothing in the repo hardcodes an origin, and `requestPasswordReset` builds its redirect from
`window.location.origin`. The custom domain is deliberately **not** in `wrangler.jsonc`; a
`routes` block would be a second source of truth for something Cloudflare already holds.

Build variables are set in Cloudflare:

```
VITE_SUPABASE_URL=https://ghcclshgdtbystosfzjl.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key sb_publishable_...>
```

`VITE_SUPABASE_URL` must be the **base project URL**: not the `/rest/v1` Data API URL, and no
trailing slash. `assertEnv` strips a trailing slash defensively.

### Root and www: the marketing surface

**The bare domain is no longer a redirect.** `enamelvault.com` is a custom domain on the same
`familyrecipes` Worker and serves the landing page. The Single Redirect rule that used to send
every bare-domain path to the app (ruleset `http_request_dynamic_redirect`, zone
`534b45be9cc7ffdd92e4792900bbec9c`, rule `59ace7314da34a3fb1b282f48e3ec99e`) is gone.

That rule was deliberately a **302 and not a 301** so this change would be possible: a 301 is
cached hard by every browser that saw it, and putting a page here later would have been fought
by every previous visitor's cache. The decision paid for itself.

`route()` in `worker/index.ts` branches on hostname before anything else. The bare host answers
a short, closed list itself and 302s everything else to the app host, path and query preserved,
which is what the old rule did for every path and why links people already hold still work.
`README.md` has the page map and the guards; this is what the Worker does with a request:

| On `enamelvault.com` | Answer |
| --- | --- |
| `/`, `/family`, `/professional` | the marketing pages, from `SITE_PAGES` in `worker/site.ts`; the hub also gets the recipe rack injected |
| `/robots.txt`, `/sitemap.xml` | its own, generated from `SITE_PAGES`, not the app's |
| `/site.css`, `/signin-choice.js`, `/favicon.svg`, `/og.png`, `/fonts/*.woff2` | served here, from the asset store |
| anything else | 302 to the same path on `recipes.enamelvault.com` |

**`/kitchen` is in that last row and must stay there.** It 302s to the family app's My Kitchen
meal plans, which is a real page people reach. That is why the professional page is at
`/professional`.

**Why the assets are served and not redirected, which cost a live defect on 2026-10-10.**
They are the same files on the same Worker, so redirecting them looks harmless. It is not: a
302 to the app host makes them CROSS-ORIGIN, and `font-src 'self'` and `img-src 'self'` then
refuse them. The live page rendered in the Georgia fallback, the mark was blocked and `og.png`
pointed at a redirect, so the share card broke. It still answered 200 throughout. **It happened
again on 2026-10-15 with `signin-choice.js`**, which was never in the allowlist: the sign-in
chooser had therefore never once opened in production, and because the masthead link is a real
href the page looked exactly as it always had. `src/site.assets.test.ts` now reads the real
markup and fails on any same-origin reference the bare host would redirect. `isSiteAsset`
in `worker/site.ts` is the allowlist; **add a file to `site.html` and you must add it there**,
and it must stay an allowlist, or this host starts serving the app's `index.html` and bundle.

**`www` is a redirect, not a second Worker host.** `www.enamelvault.com` has its own proxied
`AAAA -> 100::` and the Single Redirect rule (now matching `http.host eq
"www.enamelvault.com"` only) sends it to the apex with path and query preserved, still 302.
The Workers custom-domain form REFUSES `www.enamelvault.com` with "No zones match" and then
offers to onboard it as a new zone: **do not accept that**, it would create a second zone
competing with the one holding the MX and DKIM records. `isSiteHost` still accepts `www`, so
pointing it at the Worker later needs no code change.

**Every raw template is 404 on BOTH hosts, deliberately**: `site.html`, `family.html` and
`professional.html`. They are assets, so they are fetchable by path, but none is a page, and
serving one would give it a second URL competing with its canonical. The refusal is generated
from `SITE_PAGES` and sits ABOVE the host branch, so the bare host answers 404 directly
instead of redirecting a crawler into a dead end.

**If you ever remove the custom domain, put a redirect rule back in the same motion**, or the
apex answers nothing at all.

**Cloudflare Web Analytics auto-injection is ON**, on both the apex and the app host, checked
in a real browser on 2026-10-16: `script[src*="cloudflareinsights"]` is present on each.

This bullet said the opposite until that check, and the way it was wrong is the point.
It claimed auto-injection was off, "confirmed by fetching the live page and finding no
`cloudflareinsights` reference" — but **curl cannot see this injection at all**, as the
Cloudflare Web Analytics section further down says in as many words. The evidence was
incapable of supporting the claim, and both statements sat in this same file disagreeing.
**Check an edge-injected script in a browser, never with curl**, and when two sections of a
doc disagree, the one whose method cannot work is the one that is wrong.

It injects a beacon from `static.cloudflareinsights.com` into the page. Our CSP (`script-src
'self'`) blocked it from 2026-10-02 until 2026-10-16, but **800 pageloads were collected before
that**, between 2026-09-25 and 2026-10-02, while the pages still claimed "no analytics". So the
claim was not merely fragile, it was FALSE for eight days: the CSP arrived a week too late to
be the accident that kept it true. **A public promise should be kept by the setting that governs
the behaviour, not by a security header downstream of it**, and that is the durable lesson here
rather than the wording of any one line.

The pages no longer deny analytics at all (corrected 2026-10-16, and `src/site.claims.test.ts`
fails if the denial returns to any marketing page or to the README), so the injection no longer
makes a page lie. It is still a third-party request on every page load, which is why `/privacy`
and `/cookies` both name it.

**Injection and collection are two switches, and `auto_install` governs the second one.** This
paragraph used to say the browser was the authority and the dashboard's `auto_install: false`
was not to be trusted, because the beacon was demonstrably being injected on both hosts. Both
readings were correct about different halves: the zone-level ruleset kept injecting the beacon,
and with `auto_install` false the zone did not mount `/cdn-cgi/rum`, so every POST the beacon
made was refused. **A running beacon is not evidence that anything is being counted**, and the
field that looked like a stale lie was reporting the actual fault.

The full account, and the one-line fix that turned collection back on, is under "Cloudflare Web
Analytics is ON, and the tests cannot see it" below. This bullet covers only the marketing
surface's part of it.

**The trap when attaching the custom domain.** The API refuses with `100117: Hostname already
has externally managed DNS records` while the hand-made `AAAA -> 100::` placeholder is still
on the hostname. A Worker custom domain CREATES its own identical `AAAA -> 100::` proxied
record, which is why `recipes` has one, and Cloudflare will not adopt one it did not make. The
placeholder has to be deleted first, which means the hostname answers nothing for the seconds
in between, so delete and attach in one motion and be ready to recreate the record if the
attach fails. The dashboard does this for you behind a "replace existing DNS records" prompt;
the API does not, which makes the dashboard the easier path here.

**Do not touch the `MX` and `TXT` records on the apex while doing this.** They are Cloudflare
Email Routing and the SPF and DKIM for `moderation@enamelvault.com`, and the landing page's
one business contact link now depends on that address delivering.

A proxied `AAAA`-only record still gets Cloudflare IPv4 anycast answers, so v4-only clients are
fine. A stale `NXDOMAIN` in a local resolver can hide `www` for a few minutes; that is caching,
not the record.

### Database

```bash
npx supabase db push --remote --yes
```

**WITHOUT `--remote` THIS COMMAND PUSHES TO THE LOCAL STACK AND SAYS SO IN A LINE THAT READS
LIKE SUCCESS.** CLI v3 changed the default target, and `--linked` became `--remote`; the old
spelling only warns. On 2026-11-02 a `db push` copied from this file answered
`{"upToDate":true,...,"message":"Local database is up to date."}` while production stayed a
migration behind, and the fix looked deployed for an hour. Read the `Target:` line the CLI
prints before believing any of them: it names `local stack` or `project FamilyRecipe ·
production`.

**`--yes` is needed too, and only in an agent run.** v3 refuses a hosted mutation it cannot
get a confirmation for, with `HostedMutationConsentRequiredError`, which is a refusal and not
a failure: nothing was changed.

Linked to project ref `ghcclshgdtbystosfzjl`. **Never** `db reset --remote` now that there is
real data. Check what is actually applied with `npx supabase migration list --remote` and look
for `"remote":""`.

### Edge function

```bash
npx supabase functions deploy extract-recipe
```

**This deploy now has a HARD prerequisite: migration 0031 must be on the database first.**
Since 2026-10-01 the function calls `claim_extraction()` for a per-cook rate limit, and it
**fails closed**: when that function cannot be reached it answers 503 rather than spending a
model call it cannot account for. Deploy the function to a database without 0031 and every
extraction breaks at once, in every mode. "Migration before frontend" was always the rule
here; this one makes it mandatory rather than merely wise.

#### The SSRF guard is partly runtime-dependent, and that is a landmine worth knowing

`url` mode fetches an address the cook chose, so `limits.ts` is the only thing between this
function and the internal network. Since the 2026-10-12 audit it works in two layers, and
**only one of them is guaranteed to be active**:

- **Literal addresses are always blocked.** `privateLiteral()` covers loopback, the private
  ranges, link-local (so `169.254.169.254`), carrier-grade NAT, benchmarking space, multicast
  and the IPv4-mapped IPv6 spellings of all of them. This needs nothing from the runtime and
  is unit tested. The mapped form is why it exists: the URL parser rewrites
  `http://[::ffff:169.254.169.254]/` into `::ffff:a9fe:a9fe`, which the old dotted-quad test
  could not see and the old `::1`/`fc`/`fd`/`fe80` prefix tests did not match.
- **A hostname whose DNS record points somewhere private is blocked only if the runtime
  exposes `Deno.resolveDns`.** Where it does not, `runtimeResolver` is null and that layer is
  skipped, silently and on purpose: failing closed there would break every extraction on a
  runtime that simply has no resolver. **So verify it after a deploy** rather than assuming
  it, because `evil.example` with an A record of `169.254.169.254` is the easiest version of
  this attack and nothing in the string gives it away:

```bash
# Expect the "not a public web address" refusal, NOT a 503 and NOT a draft.
curl -s -X POST "$SB_URL/functions/v1/extract-recipe" \
  -H "Authorization: Bearer $A_REAL_USER_JWT" -H 'Content-Type: application/json' \
  -d '{"mode":"url","payload":"http://[::ffff:169.254.169.254]/latest/meta-data/"}'
```

**Neither layer stops DNS rebinding**, where the name resolves public here and private when
`fetch` resolves it again a moment later. Closing that needs a client that connects to an
address already resolved (`Deno.createHttpClient`), which is not available everywhere either.
This is a known, accepted ceiling, not an oversight.

The limits themselves are **10 extractions a minute and 60 a day per cook**, plus payload
size caps and a host check with a 2MB read cap on `url` mode. All of them are knobs,
documented where they live: the rate limits in `supabase/migrations/0031_extract_rate_limit.sql`,
the sizes and the host rules in `supabase/functions/extract-recipe/limits.ts`. Raise them
there if a real cook is ever refused. A cook who hits the limit sees the sentence in the
reply body, because `src/lib/api/extract.ts` surfaces the function's own `error` string.

The host check closes a server-side request forgery hole: before it, `url` mode would fetch
any address the caller named, including loopback and the cloud metadata address. It cannot
stop DNS rebinding, and it says so at the code rather than implying a guarantee it does not
make.

Secrets:

```bash
npx supabase secrets set MODEL_BASE_URL=... MODEL_NAME=<vision model> MODEL_API_KEY=... TRANSCRIBE_BASE_URL=https://api.groq.com/openai/v1 TRANSCRIBE_MODEL=whisper-large-v3-turbo TRANSCRIBE_API_KEY=...
```

`MODEL_NAME` serves text, url AND photo, and **must be vision-capable** or photo mode breaks.
It is currently **Gemini 3.8 Flash** via Google's OpenAI-compatibility layer, so
`MODEL_BASE_URL` is `https://generativelanguage.googleapis.com/v1beta/openai`.

**That hostname is written out here on purpose, and `supabase/processors.test.ts` reads this
file looking for it.** The endpoint lives in a Supabase secret, so it appears nowhere in the
source and no amount of grepping the code can tell you who receives a user's recipe. This
paragraph is the only in-repo record of the live provider, which makes it load-bearing rather
than informational: change the secret without changing this line and the test cannot see the
drift, which is exactly how `src/pages/Privacy.tsx` came to spend two weeks telling people that
nothing but sign-in ever reached Google.

**An optional second provider, used only when the first says "not now"** (added 2026-09-30,
after a free-tier 429 and a 503 from the same model within an hour both ended a recipe
mid-add):

```bash
npx supabase secrets set FALLBACK_MODEL_BASE_URL=https://api.deepseek.com/v1 FALLBACK_MODEL_NAME=deepseek-chat FALLBACK_MODEL_API_KEY=...
```

Leave these unset and behaviour is exactly as before. It is tried only on a status that can
fix itself (429, 500, 502, 503, 504); a 400 or 401 is our bug or our key, so a second provider
would fail identically and the first error is the one reported.

**`FALLBACK_MODEL_VISION=true` is required before a PHOTO will ever use the fallback.** Vision
cannot be detected, only declared, so the default is "cannot see": without the flag a photo
that fell back would spend a request earning a 400 and then report that instead of the real
reason the first provider failed. DeepSeek has no vision, so with a DeepSeek fallback you
leave this unset and photos simply do not fall back.

**A provider retiring a model id is a state to expect, and it used to blame the cook.** An
OpenAI-compatible provider answers 404 when the key cannot have the model named in
`MODEL_NAME`, which is what happens when a slug is retired or moved off a free tier. Until
2026-10-31 that fell through to "could not read that. Try again", so a configuration fault told
every cook their own perfectly good recipe was unreadable, advice that could never work.
`supabase/functions/extract-recipe/errors.ts` now has a 404 branch naming the model, and the
message a cook reports therefore identifies the fault class: 429 is the provider's limit,
502/503/504 busy, 401/403 the key, 404 the model id, anything else genuinely unreadable input.
**The local `supabase/functions/.env` drifts the same way and more often**, since it names free
slugs; a local 429 is usually the shared free pool rather than a bug.

**`/health/extract` cannot see any of this.** It sends an OPTIONS preflight, which the function
answers above its auth check, so it proves the isolate boots and nothing about the model path. A
wrong `MODEL_NAME`, an expired key or a provider outage all leave it green. Only a real import by
a signed-in cook closes that loop.

**The provider's error body never reaches the browser.** It goes to the function logs
(`npx supabase functions logs extract-recipe`), and the cook sees wording plus a way out. If
someone reports "the recipe assistant is busy", the real status is in those logs.

**`url` mode trims the page before the model.** It used to send the entire raw HTML, which
could exhaust a per-minute INPUT-token quota in one request. `htmlText.ts` strips to visible
text and caps at 12k characters, keeping any `ld+json` first, because that is where modern
recipe sites put the recipe and a naive script strip measured zero characters on a real page.

`npx supabase secrets list` returns **digests, not values**, so a key cannot be copied between
secrets. It does return `updated_at`, which is enough to tell when the model config last
changed without ever seeing a key.

The model call is plain OpenAI-compatible `/chat/completions` with **no `response_format`** (the
JSON schema rides in the system prompt and the reply goes through `parseModelJson`), so swapping
providers is an env-only change.

To check staleness, compare the deployed `updated_at` from `npx supabase functions list`
against `git log --since="<updated_at>" -- supabase/functions/extract-recipe/`.

### The `admin` function, and why it exists at all

```bash
npx supabase functions deploy admin
```

Everything the moderator console shows beyond the report queue needs the service-role key, so
none of it can be done from the browser:

- emails and last-sign-in live in `auth.users`, which RLS does not expose at all;
- `profiles_self_read` hides every OTHER profile row, from moderators too, so even a
  moderator's own client cannot list users;
- suspending, promoting and deleting are auth-admin or cross-row writes.

**The security model, which is the part not to change.** The caller is identified from their
verified JWT, never from the request body, and the moderator flag is read with THEIR OWN
client, so RLS is what proves the claim. The service-role client is created only after that
check passes and never decides who the caller is. A non-moderator gets 404 rather than 403, so
the endpoint cannot even be confirmed to exist.

**The Kitchen section reads the `kitchen` schema, and counts only.** It is the one function
allowed to touch both schemas, which `supabase/kitchen_seal.test.ts` holds. Since 2026-10-21 it
also reports throughput (dishes started, signed off, the median days to sign-off, and how many
have been in development over a month) and how many staff were active in the last seven days.
That last one is a COUNT and must stay one: a named person's attendance is a kitchen row, and
the owner of a group sees their own staff by name inside the kitchen app, never here. The select
list takes `user_id` alone, and `src/pages/Moderation.test.tsx` fails if a name reaches the page.

**The arithmetic lives in `kitchenNumbers.ts`, not in `index.ts`.** Vitest cannot import the
entry point (it is Deno), so logic inside it cannot be tested at all; `boots.test.ts` can only
parse it. `extract-recipe` is split the same way. Every definition there has to match
`0063_the_kitchen_can_see_its_own_throughput.sql`, because a moderator and a group's own owner
looking at the same kitchen must not be told two different stories.

Report-driven actions deliberately stay in the `resolve_report` RPC, so a report changes state
in one place and there is one audit trail rather than two.

**There IS an audit log, since `0066`.** Every moderator action writes one row to
`moderation_events` naming the actor, the action, the subject, the reason, and which door it came
through (`direct`, `report` or `appeal`). The console reads it under its Trail tab. It starts
empty: nothing before `0066` deployed could be reconstructed, so the first row is the first
action after it.

Three things about that table are easy to undo by accident:

- **It has one SELECT policy and no insert, update or delete policy.** That is the strictest
  setting, not a gap. Only the two definer functions and the service-role client write to it.
- **The insert refusal is held by the REVOKE, not by the absent policy.** Measured on 2026-10-26
  by breaking each lock in turn: adding a permissive insert policy left the test green, because
  `authenticated` has no insert privilege to exercise it with, and granting that privilege is
  what turned it red. `tests/integration/moderation_trail.test.ts` records the measurement.
- **Granting a moderator flag is the OWNER's alone** (`profiles.is_owner`). It is set by
  migration and by no code anywhere, and it is deliberately absent from `0047`'s column-level
  update grant, which is what stops any client setting it. A second owner is a SQL console job.
  **If `is_owner` is true for nobody, `set_moderator` refuses every caller**: the migration
  prints the row count it set, and the console's refusal names the reason.

If the console is unreachable, every action it performs can be done directly in SQL. The
runbook for that is kept outside the repo, in the Artifact linked from the session notes, and
the queries are reconstructible from the tables listed above.

## Monitoring

- **Errors:** an insert-only `error_log` table (migration `0018`), written by
  `reportError(context, err)` from the ten catch blocks where a failure costs someone their
  work, plus `window.onerror` / `unhandledrejection`. **There is no select policy**, so nothing
  reads it back through the app: read it in the Supabase SQL editor. That is deliberate and
  should not be "fixed" by adding a read policy, because a message can carry another
  household's recipe titles. `anon` may insert because a failed sign-in is worth seeing and
  `auth.uid()` is null at that moment.
- **Uptime:** two HEAD checks, `https://recipes.enamelvault.com/` and
  `https://recipes.enamelvault.com/health/extract`, both expecting 200. **Not the Supabase URL:**
  an unauthenticated request to a Supabase function is rejected by the gateway with 401 before
  the function starts, so healthy and dead both answer 401 and the monitor stays green through
  an outage. `worker/health.ts` probes the function with OPTIONS, which it answers in its own
  first branch above the auth check, so a 204 proves the isolate parsed, booted and ran our
  code.

  Both routes stay unauthenticated: the monitor's free plan can send no headers, and CI needs
  the version without a secret. What they do not need is to be indexed, which is why both
  carry `X-Robots-Tag` and `robots.txt` disallows `/health/`.

  **Do NOT add `/health/version` as a third monitor.** It answers 200 whatever it finds,
  including the literal string `unknown` when the stamp is missing or unreadable, because its
  job is to be COMPARED against an expected commit rather than to be alive or dead. A monitor
  pointed at it would be green through exactly the failure it exists to report. The comparison
  belongs in the `deployed` job in `ci.yml`, which is the only thing that knows which commit
  to expect.
- **Ceiling:** `error_log` has no rate limit and `anon` can write. The client caps itself at 20
  per page load, which bounds the honest case, not a hostile one. If it floods, add a limit in a
  trigger or put inserts behind an edge function.

## Environment gotchas

- **A dev sign-in does NOT cross the three localhost hosts, and for one day it did not persist
  at all.** The shared session lives in a cookie (`src/lib/sessionCookie.ts`), and the first
  version of that file wrote `Domain=localhost` so the cookie would reach `admin.localhost` and
  `kitchen.localhost` too. **Chrome refuses that cookie, silently**, exactly as it refuses an
  oversized one; `Domain=.localhost` is refused as well. Measured in the browser on
  `admin.localhost:5174` on 2026-10-26 by setting `probe=a; Domain=localhost` and reading
  `document.cookie` back: nothing. So every dev sign-in was in memory only, and the symptom was
  the console answering **"Not found" to an account whose `is_moderator` was true**, because the
  profile read asked for a user storage could no longer produce. The unit suite was green
  throughout: jsdom's cookie jar accepts `Domain` values a real browser rejects.

  The cookie is **host-only in dev** now, so it persists per host and does not hop between them.
  **One sign-in covering three hosts is therefore a PRODUCTION behaviour and can only be walked
  there.** Signing in on `localhost:5174` and expecting `admin.localhost:5174` to follow is the
  trap; sign in on each dev host separately.

- **Supabase's redirect allow list does NOT match a URL that carries a query string, unless
  the entry ends in a globstar.** An invite now travels to the confirmation email and through
  Google as `/auth/callback?next=%2Fjoin%2F<code>`. With the entry spelled exactly
  (`http://localhost:5174/auth/callback`) GoTrue rejected it and silently substituted the
  **Site URL**, so the link in the inbox landed on the home page and the invite was gone.
  Measured on the local stack on 2026-10-10 by reading the actual link out of Mailpit, first
  with the exact entry and then with `…/auth/callback**`; only the globstar carried the
  parameter through. There is no error anywhere: a rejected redirect looks exactly like a
  person who was always going to the home page.

  **You cannot prove an allow-list entry from `/auth/v1/authorize`.** The tempting shortcut is
  to request that endpoint with a `redirect_to` and read the `Location` it returns. GoTrue
  ECHOES whatever you send at that step: measured on 2026-10-26 against the production project,
  `https://evil.example/x` came back in the `redirect_to` exactly as
  `https://admin.enamelvault.com/auth/callback?next=%2F` did. The allow list is applied when the
  provider returns, not when the round trip starts, so that probe says nothing and would report
  a pass for an entry that does not exist. **Only a completed sign-in through the real provider
  tells you**, which means a real account on the host in question.

  **Both the hosted project and `supabase/config.toml` therefore need a globstar entry.**
  Hosted: Authentication -> URL Configuration -> Redirect URLs must contain
  `https://recipes.enamelvault.com/auth/callback**`. Without it the destination plumbing is
  inert: nothing breaks that was working, but an invite is still lost on every door except a
  password sign-in in the same tab.

  **The phone app needs its own entry, and it is not a URL.** Google sign-in there comes back
  to the app's own scheme, so Redirect URLs must also contain `familyrecipes://auth/callback**`.
  It fails the same silent way: GoTrue substitutes the Site URL, the system browser lands on
  the website, the app never hears anything, and nothing anywhere reports an error. Email
  sign-in on the phone needs no entry at all, which is why it is the method to try first when
  you want to know whether the app itself works. Apple sign-in needs no entry either: the token
  comes from iOS, not from a redirect.

- **The kitchen schema is invisible until the hosted project exposes it.** `supabase/config.toml`
  lists the exposed schemas for the LOCAL stack only. The hosted project has its own list at
  **Settings -> API -> Exposed schemas**, and **no migration changes it**. Migrations reached
  cloud on 2026-10-12 and the schema was still unexposed afterwards, because applying SQL
  inside the database cannot change configuration outside it. Aayush exposed it by hand the
  same day. **Both states were measured from outside with the production publishable key
  rather than assumed, and the difference is the thing to recognise:**

      before  HTTP 406  PGRST106  Invalid schema: kitchen
                        Only the following schemas are exposed: public, graphql_public
      after   HTTP 401  42501     permission denied for table orgs

  **The 401 is the correct end state, not a remaining fault.** The first is PostgREST refusing
  to ROUTE to the schema; the second is Postgres refusing a signed-out caller on GRANTS, which
  is the design: `anon` holds no table grants in `kitchen`, only `usage` and `execute` on
  `peek_invite` so an invited stranger can read an invitation.

  **That 401 body suggests `GRANT SELECT ON kitchen.orgs TO anon`. NEVER DO THAT.** The
  publishable key ships in the JS bundle on purpose, so granting `anon` on a kitchen table
  makes every group's dishes world readable. PostgREST's hint does not know about this
  project's threat model. Same shape as the redirect allow
  list needing a globstar entry: a setting outside the repo that silently makes correct code
  inert.

  **Do NOT run the integration suite against cloud to check this**, which an earlier version of
  this very bullet advised. `tests/integration/helpers.ts` creates users with
  `auth.admin.createUser`, there are 114 `makeUser` calls across the suite, and the kitchen
  publish path inserts into `public.families` and `public.recipes`. A cloud run would therefore
  seed production with over a hundred real accounts and their data, and would corrupt the
  admin console's live-logins figure, which counts real accounts. **Check it with a read-only probe
  instead**, which writes nothing and distinguishes the two failures above:

      curl -s -o /dev/null -w '%{http_code}
'         "https://<ref>.supabase.co/rest/v1/orgs?select=id&limit=1"         -H "apikey: <publishable key>" -H "Accept-Profile: kitchen"

  406 means the schema is not exposed. 401 means it is exposed and the grants are doing their
  job. The publishable key is public by design and can be read out of the deployed bundle.
- **The redirect allow list can only be checked by reading the dashboard**, or by completing a
  real sign-in; "You cannot prove an allow-list entry from `/auth/v1/authorize`" above has why,
  and the `state` is an opaque UUID so nothing in the response reveals which redirect was
  accepted either. The kitchen host's entries were confirmed by reading the dashboard on
  2026-10-15, after the probe proved useless. **The general rule that cost is worth keeping: a
  probe that returns the same answer for a known-bad input is measuring nothing, so run the
  bogus control before trusting any such check.**
- **NEVER run `npx supabase config push` against this project.** It was considered on
  2026-10-12 as a way to add `kitchen` to the exposed schemas, because `supabase/config.toml`
  already declares `schemas = ["public", "graphql_public", "kitchen"]`. **It would have broken
  production auth.** `config.toml` is the LOCAL dev config, and `config push` writes every
  property the file declares. `npx supabase config diff` showed what that meant:

  | Property | Remote (correct) | What the push would have set |
  | --- | --- | --- |
  | `auth.additional_redirect_urls` | the seven live entries (both app hosts, each with a `/**` and an `/auth/callback**`, the kitchen's `/recover`, and two localhost ports) | `https://127.0.0.1:3000`, `http://localhost:5174/auth/callback**` |
  | `auth.site_url` | `https://recipes.enamelvault.com` | `http://127.0.0.1:3000` |
  | `auth.mfa.totp.*` | enabled | disabled |
  | `auth.email.otp_length` | 8 | 6 |
  | `auth.email.max_frequency` | `1m0s` | `1s` |
  | `storage.analytics.enabled` | on | off |

  That first row is the whole invite mechanism and the globstar entries added by hand. The
  second is every auth redirect on production. **`config diff` is safe and is the only one of the pair to
  run here**; it is also the command that caught this. The exposed-schema setting is a
  dashboard change (Settings -> API -> Exposed schemas) or a targeted Management API
  `PATCH /v1/projects/{ref}/postgrest`, never a config push.

  The deeper rule, and the reason this sits next to the exposed-schema note rather than in a
  footnote: **a local config file and a production project are not two copies of one thing.**
  Any command that syncs them wholesale will carry the local values that exist precisely
  because they are not production.

- **A kitchen account used to be undeletable, and that was an ops note in this file for a day
  before anybody read it as a bug.** Eight attribution columns in `kitchen` referenced
  `auth.users` with no on-delete action, so Postgres refused to remove the login of anyone who
  had done any work there, and `delete-account` blanks the profile FIRST, so the person was
  left with their identity erased and their login live. **Fixed in `0059`.** The rule for
  writing a new column is in `CLAUDE.md`; the guards are `supabase/rls.test.ts` and
  `tests/integration/kitchen_account_deletion.test.ts`. Not repeated here.

  **What this file is for: a throwaway kitchen account now deletes from Authentication -> Users
  like any other**, and the old advice to stop after accepting the terms is gone because it is
  no longer true. **The last owner of an org cannot leave over the API** (`0059` tightened
  `staff_delete`), because an org with no owner can never take its published dish down again.
  Deleting the LOGIN still strands the org through the cascade on `staff.user_id`,
  deliberately: erasure beats an invariant. An org in that state needs a service-role insert
  into `kitchen.staff` to be administrable again, and there is no UI for it.

  **Still open and a product question, not an ops one:** the kitchen app has no self-service
  deletion of its own, so a chef's only route is the family app's Settings page on the other
  host. `PRODUCT.md` carries it.

- **Locally the kitchen schema has an order trap** (met 2026-10-11). `npx supabase start`
  restores the database from a backup and only then starts PostgREST, so a `config.toml` that
  exposes `kitchen` before any migration has created it makes PostgREST exit 503 with
  `schema "kitchen" does not exist`, and `db reset` cannot run while the stack is down. To break
  the cycle: take `kitchen` out of `config.toml`, `npx supabase start`, `npx supabase db reset`
  (which creates the schema), put `kitchen` back, then stop and start again. **A fresh clone
  meets this on its very first `supabase start`.**

- **The kitchen app records its own terms acceptance, in its own table.** `0046` adds
  `kitchen.terms_acceptance`, keyed by user rather than by org, because a person accepts once
  rather than once per employer and a brand-new account has no `kitchen.staff` row while
  creating a group is already an action. The app's `/terms` and `/privacy` sit outside the gate
  and inside the shell, so they are readable before accepting; everything else, `/join/:code`
  included, is inside it. `src/kitchen/routes.terms.test.tsx` fails if an action route escapes.
  **Bump `KITCHEN_TERMS_VERSION` in `src/kitchen/components/KitchenTermsGate.tsx` when that
  page's wording changes**, and `KITCHEN_TERMS_UPDATED` in `src/lib/legal.ts` with it, or
  nobody is re-asked; a fingerprint test fails if you forget.

- **The kitchen host is LIVE as of 2026-10-12**: <https://kitchen.enamelvault.com> serves the
  kitchen app, and all four of the manual steps below are done. Kept in full because they are
  the runbook for the next host, and because three of the four are settings outside the repo
  that no test can see.

  **How the custom domain was actually created**, since the dashboard attempt produced nothing
  and that is worth knowing: a `PUT /accounts/{account_id}/workers/domains` with
  `{zone_id, hostname, service: "familyrecipes", environment: "production"}`. It provisions the
  proxied `AAAA -> 100::` record and the certificate itself, so **no DNS record is created by
  hand** (see the `100117` trap above). Measured timings: DNS answered after about 45 seconds,
  TLS after about 60 more, and during that gap the host fails to connect rather than returning
  an error, which reads exactly like a misconfiguration and is not one.

  **Diagnosing "the host is not showing up": ask the API what exists, do not reason about
  propagation.** `GET /accounts/{id}/workers/domains`, `GET /zones/{id}/dns_records` and
  `GET /zones/{id}/workers/routes` answer definitively. When this was hit, all three were empty
  for `kitchen.`, so nothing was propagating and no amount of waiting would have helped. An
  authoritative `NXDOMAIN` from the zone's own nameservers says the same thing from outside:
  the record does not exist, as distinct from a resolver not having it yet.

  A DNS
  record for `kitchen.enamelvault.com` pointing at the Worker, a Worker route for that
  hostname, and **its own globstar entries in the hosted Supabase redirect allow list**
  (`https://kitchen.enamelvault.com/auth/callback**`, plus the dev form
  `http://localhost:5174/auth/callback**` if the kitchen entry is opened there). Sign-up and
  Google both build `redirectTo` from `window.location.origin`, so without the allow list
  entry GoTrue silently substitutes the Site URL and the person lands on the FAMILY app with
  their invite lost. That substitution is silent: nothing errors.
- **A published dish is an ordinary public recipe on the APP host.** It is a SNAPSHOT, so a
  later revision does not change the public page until somebody publishes again, and the
  Worker's per-recipe OpenGraph tags and the sitemap pick it up like any other public recipe.
  What goes out is the version the sites are cooking, the latest APPROVED one, never the
  newest. A moderator takedown blocks republishing by design, because
  `enforce_publish_rules` fires on the bridge's update too, and the owner reads that refusal
  verbatim in the kitchen app.
- **Taking a dish down leaves its snapshot row in place**, with `unpublished_at` set. That is
  deliberate: the row holds the recipe id, so re-publishing reuses the same public URL and a
  link somebody already sent keeps working. "Is it public" is therefore
  `unpublished_at is null`, never the row existing.
- **`kitchen.html` is refused as a path on every host.** It is fetched internally by the
  Worker, exactly as `site.html` is. If you add a file that `kitchen.html` references, add it
  to `isSharedAsset` in `worker/kitchen.ts` or the kitchen host will rewrite the request to
  the app shell and the browser will be handed HTML where it asked for javascript.

- **`insert().select()` + a membership-gated SELECT policy fails for the creator.** The
  RETURNING applies the SELECT policy to the new row, and a family creator is not a member yet.
  Fixed in `0007` (creator reads via `created_by = auth.uid()`). Integration tests missed it
  because they used the service-role client, which bypasses RLS.
- **pgcrypto on cloud:** `gen_random_bytes` is not on the cloud migration role's search_path.
  `0001` uses `create extension pgcrypto with schema extensions` and calls
  `extensions.gen_random_bytes`.
- **Edge function CORS must allow `authorization, x-client-info, apikey, content-type`.**
  supabase-js sends `apikey` and `x-client-info`; missing them means the preflight fails and you
  get "Failed to send a request to the Edge Function". Local Kong masks this; it only bites on
  cloud.
- **vitest's forks pool crashes on Node 20** (`webidl.util.markAsUncloneable`). CI uses Node 22.
- **jsdom leaks supabase-js auth sessions between clients.** Integration tests use
  `// @vitest-environment node` plus `{ auth: { persistSession: false, autoRefreshToken: false } }`.
- **Every integration test MUST start with `// @vitest-environment node`.** `vitest.config.ts`
  sets `environment: "jsdom"` globally for the app's component tests, so a file without the
  pragma gets jsdom. In jsdom a `Blob` is a *jsdom* Blob, which undici's `fetch` cannot consume
  as a request body: a storage upload then **never completes**, and the test dies on whatever
  timeout it has rather than erroring.
  Four files added on 2026-09-28 omitted the pragma and cost two red CI runs. It passed on
  Windows and hung on the Linux runner, which made it look environmental.
  **Reproduced and isolated** in a `node:22` container against the same database, with the
  environment as the only variable: `@vitest-environment node` passed in 298ms, the jsdom
  default hung until timeout. Raising the timeout does not help, because it is not slowness.
  Integration tests touch a database and never a DOM, so jsdom is wrong for them anyway.
- **Storage treats replacing a file as an UPDATE.** A bucket policy with only
  insert/select/delete lets the first upload succeed and fails every replacement after it.
- **Joining a family** goes through the `join_family_by_code` SECURITY DEFINER RPC, because RLS
  blocks a plain select.
- **Supabase `updateUser({ password })` does not ask for the current password**, so anyone at an
  unlocked machine is an account takeover. `changePassword` re-authenticates with
  `signInWithPassword` first. The comment there exists because the re-auth looks redundant and
  would otherwise be deleted as dead code. `setNewPassword` (recovery) deliberately does not
  re-auth: Supabase has already put a recovery session in place.
- **Aayush's shell is Windows PowerShell 5.1, where `&&` is a parse error.** One command per
  block, or `cmd1; if ($?) { cmd2 }`.
- **Disconnecting the repo in Workers Builds DELETES the build configuration**, not just the Git
  link: config, trigger and every build environment variable go together, and queued builds are
  cancelled. A "just reconnect it" fix silently drops the `VITE_*` vars, and the next build
  deploys a frontend whose `assertEnv` throws on load, which is worse than the stale deploy it
  was meant to fix. Reconnecting does not restore the old settings. **Read the config back after
  any reconnect and diff it.** Restoring needs no dashboard: `PATCH
  /accounts/{acct}/builds/workers/{script_tag}` with a full `production_settings` block.
- **The GitHub repo was renamed `FamilyRecipes` to `EnamelVault` on 2026-11-04, and the
  Cloudflare Worker was NOT.** The Worker is still `familyrecipes` even though it serves all
  three apps, so it is the one genuinely misnamed thing here, and it stays that way: Cloudflare
  has no rename for a Worker, so correcting it means a new Worker, re-attaching four custom
  domains, and reconnecting Workers Builds, which deletes the build configuration (above).
  A cosmetic name is not worth a deploy outage. Workers Builds tracks the repository by id, so
  the rename did not disconnect it, and GitHub redirects the old URLs; the CI `deployed` job is
  what would say otherwise, which is the only reason to trust any of this.
- **`familyrecipes://` and `com.enamelvault.familyrecipes` are NOT leftovers from the old repo
  name, so do not "tidy" them.** The family app is still the product called Family Recipes:
  `src/pages/Terms.tsx`, `Privacy.tsx`, `Help.tsx` and the kitchen's own terms all name it, and
  the terms gate holds that wording. `com.enamelvault.familyrecipes` is already the right
  shape, the org then the app, and a kitchen app would be `com.enamelvault.kitchen`. Enamel
  Vault is the umbrella; Family Recipes is one product under it. The phone app's scheme and
  bundle id follow the product, not the repository.
- **Build env vars live on the CONFIG, not the trigger.** A trigger can report
  `environment_variables: {}` while builds it starts resolve both vars correctly, because they
  are read from `production_settings` when the build is queued. Check a queued build's
  `build_trigger_metadata.environment_variables` instead.
- **Resend has moved off Amazon SES to `forge.rmta.net`,** so SPF is two CNAMEs, not MX plus a
  `v=spf1` TXT. Every guide describing SES records is stale. The CNAMEs **must stay DNS-only**;
  Cloudflare defaults a new CNAME to Proxied, and a proxied CNAME breaks mail.
- **Inbound mail: `moderation@enamelvault.com` forwards to a Gmail via Cloudflare Email
  Routing** (enabled 2026-10-01). The zone had NO MX and no root SPF before that, so every
  message to the address `/terms` publishes was being dropped at the edge with no bounce and
  no trace. Routing adds three root MX records (`route1/2/3.mx.cloudflare.net`), a root
  `v=spf1 include:_spf.mx.cloudflare.net ~all`, and a `cf2024-1._domainkey` DKIM record.
  **Root SPF does not touch sending**, which goes out as `noreply@mail.enamelvault.com`: SPF
  is per exact name and does not inherit, so `send.mail.enamelvault.com` keeps its own record.
  That was checked against the actual `from:` in `notify-report` rather than assumed.
  Forwarding is only as good as its destination: the destination address must stay verified in
  Cloudflare, and if it is ever removed, mail starts disappearing silently again.
- **Sending AS `moderation@enamelvault.com` WORKS** (confirmed 2026-10-10 via mail-tester):
  SPF passes, DKIM is valid and aligned to `enamelvault.com`, and the message leaves through
  Resend's infrastructure rather than Google's. **The apex SPF was correctly left alone**: the
  return path is the `send.` subdomain, which carries its own SPF, and that aligns with the
  From domain under DMARC's relaxed rules. Do not add Resend to the apex SPF record.

  **The trap that cost a round of debugging:** the first test looked like a domain problem and
  was not sent from the domain at all. Gmail defaults the From field to your own address, so
  the message went out as `aayus.pok@gmail.com` through Google's servers, and every auth result
  in the report was GOOGLE's. The tells are `FREEMAIL_FROM` naming a gmail.com address and a
  relay IP in Google's `209.85.x.x` range. **When testing a send-as, check the From field in
  the report before reading anything else in it**, or you will tune records that were never
  involved. Set "When replying to a message: reply from the same address the message was sent
  to" so moderation replies do not depend on remembering.

  **Remaining negative, and it is not fixable:** `FROM_FMBLA_NEWDOM28`, "domain registered in
  the last 14-28 days", worth -0.8 and the largest single penalty in the report. The domain was
  registered 2026-09-25. Nothing configurable improves it; it ages out. A brand-new sending
  domain lands in spam more often regardless of perfect authentication, and a reply from a real
  recipient is worth more than any record change.

  **Still open: DMARC has no `rua=`**, so there are no aggregate reports and alignment problems
  are invisible. Add one before considering a move from `p=none` to `p=quarantine`; raising the
  policy before seeing a week of clean reports is how people break their own mail.

- **The earlier half-done state, for context.** Cloudflare Email
  Routing is receive-only, so replying needs an SMTP sender, and the landing page now invites
  strangers to write to that address, which makes replying from a personal Gmail a live
  problem rather than a tidiness one.

  **Two SEPARATE Resend domains now exist, and confusing them wastes a session.**
  `mail.enamelvault.com` was verified earlier and is what the `notify-report` edge function
  sends as. `enamelvault.com`, the ROOT, was added on 2026-10-10 for the Gmail send-as path,
  and is a different domain entry with its own records and its own DKIM key.

  The root's three records are in the zone and **all DNS-only, confirmed**:
  `send.enamelvault.com` and `rsend.enamelvault.com` CNAMEs to `*.forge.rmta.net`, plus a
  `resend._domainkey.enamelvault.com` TXT. They are on SUBDOMAINS, so they do not collide with
  the apex `MX` records Email Routing uses. **If Resend ever asks for an apex `MX`, stop:**
  that would fight Email Routing and break receiving.

  What remains once Resend reports the root verified: create a sending API key, then in Gmail,
  Accounts and Import -> Send mail as -> add `moderation@enamelvault.com` with SMTP host
  `smtp.resend.com`, port 587, username the literal word `resend`, password the API key, TLS.
  Gmail mails a confirmation code to that address, which Email Routing forwards to the inbox.
  **Verify by sending to an OUTSIDE account and reading the headers for `DKIM: PASS`**, not by
  mailing yourself: DMARC is `p=none`, so a misaligned message will not bounce, it will just
  quietly land in spam.

- **DMARC now HAS a `rua=`**, set 2026-10-10 once the domain started sending real mail:
  `v=DMARC1; p=none; rua=mailto:moderation@enamelvault.com`. Without it there were no
  aggregate reports, so an alignment failure would have been invisible.

  **It points at an address on THIS domain on purpose.** The earlier note here said a `rua=`
  was impossible, and it was right about the case it considered: a reporting address on a
  DIFFERENT domain needs an authorisation record at that domain
  (`enamelvault.com._report._dmarc.gmail.com`), which Gmail does not publish, so reports to a
  Gmail address are silently discarded. An address on the same domain needs no such record,
  and Email Routing forwards it to the inbox anyway. That option did not exist when the note
  was written, because `moderation@` was not yet a working mailbox.

  **Do NOT move `p=none` to `p=quarantine` until a week of those reports has been read.**
  Raising the policy before confirming alignment is how a domain starts bouncing its own mail.

## Landmine: custom aisles would be silently dropped

Not a live bug. It becomes one the moment family-editable aisles ship.

`ingredient_categories.category` is free text, so an aisle outside the curated list is already
storable. `groupIngredientsByCategory` in `src/lib/groupIngredients.ts` handles that correctly,
appending unrecognised aisles before `Other`. **Three other places keep only curated aisles** and
would drop those ingredients entirely:

- `src/components/GroceryPanel.tsx`: `CATEGORY_ORDER.filter((c) => byAisle.has(c))`
- `src/components/UpcomingGroceryPanel.tsx`: same shape
- `src/pages/Cupboard.tsx`: `[...CATEGORY_ORDER, "Other"].filter(...)`

No dropdown offers a non-curated value today, so nothing can write one. The fix is to share the
rule `groupIngredientsByCategory` already implements rather than keep four copies of which one is
right. The open design fork was: layer family rows over the curated list (recommended) versus
seed-and-replace.


## Search engines: how Google actually finds this

Nothing needs to be bought or installed for Google to index the site, but it will not happen
on its own as fast as it should. Three things make it work, and two of them are one-off manual
actions nobody can do from this repo.

### What the code already does

- **`public/robots.txt`** allows crawling, blocks every signed-in and per-user route, blocks
  `/health/`, and points at the sitemap. It is a static asset, so it needs no Worker code.
  **The two health routes also send `X-Robots-Tag: noindex, nofollow` themselves** (added
  2026-10-13), because robots.txt asks a crawler not to FETCH while the header stops it
  INDEXING what it fetched anyway. That matters for these two and not for the rest of the
  Disallow list: a crawl of `/health/extract` sends a real request upstream on every hit and
  the answer may not be cached, and an indexed `/health/version` would publish the deployed
  commit of a public repository where it cannot be taken back.
- **`/sitemap.xml`** is built by the Worker on request from live data: the four public
  documents in `STATIC_SITEMAP_PATHS`, every public recipe that has not been removed, and
  every public cook. It is cached for an hour.
- **Canonical URLs, self-referencing on EVERY route.** `enrichShell` rewrites the canonical and
  `og:url` to the requested path for every shell response, and `rewriteTags` does the same per
  recipe.

  **This used to be per-recipe only, and that cost the entire site its indexing.** Every route
  is served the one `index.html`, whose canonical is hardcoded to the site root, so `/terms`,
  `/privacy`, `/cookies`, `/help` and `/cooks/:handle` each told Google their real address was
  `/`. Search Console filed five of the seven sitemap URLs under "Alternate page with proper
  canonical tag" and indexed none of them. The note that used to sit here described the
  per-recipe rewrite as if it were the whole story, which is exactly how the gap survived.

  The guard is `worker/meta.test.ts`: a route with NO entry in `PUBLIC_PAGE_COPY` must still
  canonicalise to itself, because that is the branch every new route falls into.
- **An unknown path answers 200 with a "That page is not here" page, which is a SOFT 404 to a
  crawler, and that is deliberate.** Both apps gained a catch-all route on 2026-10-15; before
  it, an unmatched path rendered an empty tree. The status stays 200 for two reasons, and the
  full argument is the comment at the top of `src/pages/NotFound.tsx` rather than repeated
  here: the Worker would need a copy of the route table to know a typo is dead, and for the
  URL a crawler actually holds, a recipe that was public and is now unpublished, a 404 is
  impossible because `enrichRecipePage` reads with the anon key and a family-visibility recipe
  reads as null in exactly the same way. The kitchen host is unaffected either way, being
  `noindex, nofollow` in both its meta tag and its header.
- **JSON-LD `Recipe` data** is injected into each recipe page, which is what makes Google
  eligible to show a rich result (photo, times, ratings slot) instead of a plain blue link.
- **Real titles and descriptions in the HTML.** This is the part people get wrong with a SPA:
  a crawler does not run JavaScript reliably, so a page whose title is only set by React is a
  page Google sees as blank. The Worker writes these before the HTML is served, which is why
  `enrichRecipePage` and `enrichShell` exist at all and why both must keep degrading to the
  untouched asset rather than failing. `/cooks/:handle` gets its title from a `public_cooks`
  read; the four documents get theirs from the `PUBLIC_PAGE_COPY` table.
- **The four public documents' prose is rendered at BUILD time** by `scripts/prerender.mjs`
  into `dist/prerender/*.html`, and `enrichShell` injects it into `#root`. It is crawler-only
  output: `src/main.tsx` calls `createRoot().render()`, which discards `#root`'s children, so
  there is no hydration contract and a stale fragment cannot break the page for a person.
  **If anyone moves that to `hydrateRoot`, that safety argument is void.**

  The fragments are refused as public paths by the Worker and disallowed in `robots.txt`: a
  fragment has no head and no canonical, so an indexed one is a context-free duplicate.

### The manual steps, which nobody in this repo can do for you

1. **Search Console is VERIFIED** (2026-10-10), as a **Domain property** on `enamelvault.com`
   using the DNS TXT method. A Domain property is the right shape here because it covers the
   apex, `www` and `recipes` in one; a URL-prefix property covers a single host, and the
   HTML-file method cannot work on the apex at all, since that host 302s any path it does not
   explicitly serve, so the verification file would redirect away.

   The `google-site-verification` TXT sits on the apex **alongside** the SPF TXT. Two TXT
   records on one name is correct and required: **never merge them, and never edit the SPF row
   to make room.**

   Search Console's flow can jump straight to checking without ever showing you the record,
   which then fails because nothing was added. The record is recoverable from
   Settings -> Ownership verification.
2. **Both sitemaps are SUBMITTED** (2026-10-10), into the one Domain property, because the
   two hosts each have their own: `https://recipes.enamelvault.com/sitemap.xml` (the recipes,
   the cooks, and the four public documents) and `https://enamelvault.com/sitemap.xml` (the
   landing page, one URL). Google re-reads them on its own afterwards, so **neither needs
   resubmitting when a recipe is published.** A Domain property takes a full URL here; a
   URL-prefix property would only take a path, and would need two properties.
3. **Indexing for `https://enamelvault.com/` was requested** (2026-10-10). That is the root
   worth indexing, and it is a one-off.
   The app host's `/` is behind `RequireAuth` and bounces a crawler to `/signin`, which is why
   it was removed from `STATIC_SITEMAP_PATHS`: do not put it back.

**A cloud routine checks the routing weekly**, Saturdays 09:00 ET: "FamilyRecipes: weekly SEO
routing health", `trig_01AGramTdpShHBEsFPTezBFR`, at
<https://claude.ai/code/routines/trig_01AGramTdpShHBEsFPTezBFR>. It curls both hosts and
asserts the eight invariants that produce Search Console's "Excluded by robots.txt" and "Page
with redirect", including that the apex assets are not redirected. **It cannot read Search
Console** (that needs a Google login), so it reports the routing facts and asks a human to
read the report. It has no Write or Edit tool and can change nothing. Its results appear in
its own run sessions at that link, not by email.

Bing has the equivalent at Bing Webmaster Tools and can import the Search Console setup.

### What to expect, honestly

A new domain with few inbound links is indexed slowly, typically days to a few weeks, and
being indexed is not the same as ranking. Recipe queries are among the most competitive on the
web. The realistic goal here is that people who search for this site, or for a recipe they were
sent a link to, find it, not that it outranks an established recipe publisher.

**Separate the Search Console rows that are DEFECTS from the ones that are Google's judgement,
because only the first kind is an engineering task.**

| Row | Which kind |
| --- | --- |
| Alternate page with proper canonical tag | A defect, and it was ours. Fixed 2026-10-12; see the canonical note above |
| Page with redirect | Not a defect. `www.enamelvault.com` 302s to the apex, which is intended |
| Crawled - currently not indexed | Google's judgement, NOT a defect. Nothing in the code causes it |

That last row is the one that tempts you into building something. **Googlebot does render
JavaScript**, and these pages already serve a correct title, description and JSON-LD, so client
rendering is usually not the cause: a thin, new, low-authority site is. When this was last
looked at, the sitemap held seven URLs and one public recipe. Prerendering the four documents
was done because it was cheap, not because it was diagnosed. **Fix the defect rows, then wait
and measure, before spending a week on the judgement row.**

### Checking it after a deploy

```bash
curl -s https://recipes.enamelvault.com/robots.txt
```

```bash
curl -s https://recipes.enamelvault.com/sitemap.xml | head -20
```

A document must carry its own prose, its own title and its own canonical. The cache-buster is
not optional: without it you can be reading a CDN copy of the previous deploy.

```bash
curl -s "https://recipes.enamelvault.com/help?cb=$RANDOM" | grep -c "prose plate"
```

A cook page must carry the cook's name, not "Family Recipes", and the fragments must be
refused as public paths.

```bash
curl -s "https://recipes.enamelvault.com/cooks/yusha?cb=$RANDOM" | grep -o "<title>[^<]*"
```

```bash
curl -s -o /dev/null -w "%{http_code}
" "https://recipes.enamelvault.com/prerender/terms.html"
```

Rich results can be checked at <https://search.google.com/test/rich-results> against any
public recipe URL. **The Worker is what serves both of these, so neither works from
`npm run dev`**: Vite serves `robots.txt` as a static file but knows nothing about
`/sitemap.xml`. Test them against a deployed preview or production, not locally.

## The phone app: building it, signing it, and shipping it

The phone app is `mobile/`, Expo SDK 58 managed, built by EAS. It is not deployed by
Cloudflare and nothing about it is automatic: **no commit anywhere builds or ships this app.**

### Two things must be true before the first build, and neither is in the repo

1. **`mobile/.env` holds the real publishable key.** It ships with
   `EXPO_PUBLIC_SUPABASE_ANON_KEY=PASTE_PUBLISHABLE_KEY`, and `mobile/src/supabase.ts` throws
   at startup on that literal rather than failing later with an opaque 401. Read the real one
   with:

   ```bash
   npx supabase projects api-keys --project-ref ghcclshgdtbystosfzjl
   ```

   `.env` is gitignored, so a fresh clone and every CI runner starts from the placeholder.
   **Never the service key**: it bypasses RLS and would be readable in the bundle on a
   rooted phone, where the whole security model is RLS.

2. **`familyrecipes://auth/callback**` is in the hosted project's Redirect URLs** if Google
   sign-in is wanted, globstar included. Email sign-in needs no entry and Apple needs none,
   which is why email is the method to try first when something is wrong: it isolates the
   failure to the allow list. The measurement that a missing entry is silent, not loud, is in
   the Environment gotchas section above.

### The build

```bash
cd mobile && npx eas build --platform ios --profile production
```

`eas.json` holds three profiles: `development` (a dev client for Metro), `preview` (internal
distribution, for the device walk) and `production` (`autoIncrement`, store distribution).
`appVersionSource` is `remote`, so **the build number lives on EAS and not in `app.json`**:
bumping it by hand in the repo changes nothing, and two local builds would otherwise collide
on the same number.

Signing credentials are held by EAS, not here. There is deliberately no keystore and no
`.p8` in this repository, and `mobile/credentials.json` is not used.

### The store privacy labels must agree with `Privacy.tsx`, which is the authority

`src/pages/Privacy.tsx` names every third party this app can reach, and
`supabase/processors.test.ts` fails the build if the code can reach one the page does not
name. The store questionnaires ask the same question in their own words, so **the page is the
source and the labels are the copy, never the other way round**. As of 2026-11-02 the named
set is Supabase, Cloudflare, Google (sign-in and Gemini), DeepSeek and Groq.

What that means for the forms, in their vocabulary:

| They ask about | The answer, and why |
| --- | --- |
| Contact info (email address) | Collected, linked to identity, used for app functionality only. It is the sign-in identifier. |
| User content (recipes, photos, comments) | Collected, linked to identity. Recipe text reaches the extraction providers above when a cook asks for an import; nothing is sent otherwise. |
| Identifiers | Collected, linked to identity: the account id. No advertising identifier is read, and there is no SDK in the app that could read one. |
| Usage data, diagnostics | **Not collected.** There is no analytics SDK and no crash reporter in `mobile/`. `src/lib/browserStorage.test.ts` holds the web side of this claim; the phone side is that `mobile/package.json` has no such dependency, which a reader can check in one glance. |
| Tracking (ATT) | **No.** Nothing is shared with a data broker and nothing is joined with third-party data, so the app does not need the App Tracking Transparency prompt. Adding anything that does makes `Privacy.tsx` part of that change. |

### The dry run, 2026-11-02, and what it found

`npx expo-doctor` passes 20 of 20 and `npx expo config --type public` resolves, so the config
is valid. **Neither of those looks at a picture**, and the thing that was actually wrong was a
picture: every file in `mobile/assets` was the unmodified `create-expo-app` template artwork,
and `app.json` carried that template's pale blue `#E6F4FE` as the Android icon background. The
app would have reached the App Store wearing Expo's default icon with a green suite.

The icons are now **generated** by `scripts/app-icons.py` from the mark in
`public/favicon.svg`, for the same reason `scripts/og-card.py` generates the link-preview
card: a drawing nobody generates drifts from the product. Rerun it when the mark or the
palette changes. `scripts/app-assets.test.ts` holds the two things a generator cannot: that
no colour outside `src/mobile/theme.ts` reappears in `app.json`, and that `icon.png` has no
alpha channel, which App Store Connect rejects hours after a build finishes.

**The same sweep over the web apps, 2026-11-04: no template artwork survives there.**
`public/favicon.svg` IS the mark and stays hand-drawn, because its own comment carries the two
rejected alternatives a generator would throw away; `public/og.png` is generated and matches
it, and `OG_CARD` in `worker/meta.ts` agrees with the `og:image` in both `index.html` and
`kitchen.html` at `?v=2`. The kitchen serving the family's card is deliberate and its trigger
to change is written at the tag.

One real gap was there, and it was an absence rather than a drift: there was no
`apple-touch-icon`, so iOS saved a SCREENSHOT OF THE PAGE as the home-screen icon for anyone
who bookmarked either app. `scripts/app-icons.py` now draws `public/apple-touch-icon.png` too.
**Adding it to `kitchen.html` required adding it to `SHARED_ASSET` in `worker/kitchen.ts`**,
an anchored allowlist whose comment asked people to remember; `scripts/app-assets.test.ts` now
derives the question from the HTML instead, so the next `<link>` cannot be forgotten. **It
lives there and not beside the worker's own tests because `worker/tsconfig` has no node
types on purpose**: a test there that reads a file passes under vitest and fails `npx tsc -b`,
which is exactly how it was first written. That
guard found `/src/kitchen/main.tsx` on its first run, which is the Vite source entry and is
excluded on purpose, since the build replaces it with the hashed bundle.

**There is still no web manifest, and that is not an oversight to fix quietly:** shipping one
makes the site installable and puts it in competition with the phone app for the same home
screen. It is a product call, so it is recorded here as absent rather than decided.

**Two things block a build, and both are Aayush's alone:**

1. **`npx eas-cli whoami` says "Not logged in".** `npx eas login` is interactive, so no
   session can do it.
2. **`app.json` has no `extra.eas.projectId`**, so the app is not linked to an EAS project.
   `npx eas init` creates that project on Expo's servers under whoever is logged in. It is
   left undone on purpose: it is an account-level resource, not a repo change.

**Set `ios.config.usesNonExemptEncryption` before the first submission.** It is absent, so
App Store Connect asks the export-compliance question on **every** upload. The answer for this
app is `false` (it uses HTTPS and the platform's own hashing for PKCE, nothing else), but the
declaration is a legal statement about the person submitting, so it is left for Aayush to make
rather than written into the repo by a session.

### Cold start against Safari: NOT YET MEASURED

The plan asks for both numbers in this file, three runs each, and **neither has been taken**:
nothing has run on a real phone yet. The procedure, so the numbers are comparable when they
are taken: force quit both, then time from tap to the shelf being readable on the phone app,
and from tap to the recipe list being readable at `enamelvault.com` in Safari, three times
each, on the same device and the same network. Write both medians here with the device and
the date, because a number with no device attached cannot be compared to the next one.

## Compliance: the three claims the code has to keep true

The public pages make statements about this app. Each is backed by a test rather than by
anyone remembering, because the failure mode is never ignorance, it is not re-reading.

| The claim | Where it is made | What holds it up |
| --- | --- | --- |
| No cookies and no trackers, so no consent banner | `src/pages/Cookies.tsx` | `src/lib/browserStorage.test.ts` |
| The marketing footers do not deny the page count `/cookies` discloses | the three `public/*.html` footers | `src/site.claims.test.ts` |
| WCAG 2.2 AA | `src/pages/Help.tsx` | `src/index.contrast.test.ts`, `src/lib/accessibility.test.ts` |
| The processors we name are the processors we use | `src/pages/Privacy.tsx` | `supabase/processors.test.ts` |
| The accepted terms version matches the terms text | `src/components/TermsGate.tsx` | `src/components/TermsGate.version.test.ts` |

**Adding analytics, an embed, or any non-essential storage makes a cookie banner legally
mandatory**, and `browserStorage.test.ts` is wired to go red at that moment. When it does, the
job is two things, not one: add the banner, and correct `Cookies.tsx`.

**The processor list used to be the weak link, and it failed in production.** From 2026-09-26
to 2026-10-11 `MODEL_BASE_URL` pointed at Google Gemini while `/privacy` said, under its Google
heading, that Google was used for sign-in only. Every photographed recipe card was going to a
company the page promised it did not reach. Nothing in the codebase changed when that happened,
so no test, review or type check could have caught it.

`supabase/processors.test.ts` now holds it, and it reads BOTH the code and this document,
because the live provider is a secret and this document is the only place in the repo that
records it. It fails when an AI endpoint is configured or documented without the company being
named on the privacy page, when a new outbound hostname appears in the code, or if the typeface
ever returns to Google Fonts.

**It is a weaker guard than it looks, and the limit is worth knowing:** it cannot read the
actual secret, so it catches drift between the docs and the page, not between the page and
reality. The way to check reality is `npx supabase secrets list`, which returns sha256 digests
rather than values, so compare a candidate with
`printf '%s' 'https://host/v1' | sha256sum`. That is how the Gemini switch was eventually found.

**The order matters when you change provider:** edit `Privacy.tsx`, add the endpoint to
`AI_PROVIDERS` in the test, update the paragraph above, deploy the page, and only then set the
secret. Backwards means the page is false for as long as it takes someone to notice.

### Cloudflare Web Analytics is ON, and the tests cannot see it

Enabled at the ZONE level since 2026-09-25, so Cloudflare injects the RUM beacon at the edge
and it never appears in `index.html`. **`browserStorage.test.ts` therefore cannot detect it**,
and did not: the pages claimed "no analytics at all" for a week while it was running.

**IT COLLECTS, on all three hosts, since 2026-10-19.** `POST /cdn-cgi/rum` returns 204 and the
RUM API returns rows. The apex collects for the first time ever, and unsampled: September's
counts are all multiples of ten, the current ones are single figures.

**The fix was one field, and NOT deleting anything.** This file used to recommend deleting the
site record and letting Cloudflare recreate it, which was unnecessary and would have destroyed
the history. The record had `auto_install: false` while its injection ruleset was
`enabled: true`. That is a real state, not a contradiction: **keep injecting the beacon onto
every page, and mount no collector to receive what it sends.** Repairing it in place restores
collection and keeps the token:

```
PUT /accounts/<id>/rum/site_info/3146b01062d0453488f5cc9e53900f91
{ "zone_tag": "534b45be9cc7ffdd92e4792900bbec9c", "auto_install": true,
  "enabled": true, "lite": false }
```

`enabled` is only accepted when `auto_install` is true, which is the API saying they are not
independent. **Injection and collection are two switches**, and a running beacon is not
evidence that anything is being counted.

**MEASURE IT WITH THE GRAPHQL API. A curl probe cannot tell.** An empty `POST /cdn-cgi/rum`
returns 404 against `cloudflareinsights.com` itself, and so does a realistic beacon payload
carrying the live token, so a 404 from our hosts says nothing about our zone. This file
recommended exactly that probe for a fortnight and recorded a false conclusion from it.

```graphql
query { viewer { accounts(filter: { accountTag: "<account>" }) {
  rumPageloadEventsAdaptiveGroups(limit: 50,
    filter: { date_geq: "2026-09-20", siteTag: "3146b01062d0453488f5cc9e53900f91" },
    orderBy: [date_ASC]) { count dimensions { date requestHost } }
} } }
```

`POST /graphql`. Rows mean collection; an empty array means it is dropping counts. The site
record itself is `GET /accounts/<id>/rum/site_info/list`, and its `site_token` must equal the
one in the page's `data-cf-beacon` (currently `8dab991f...`).

**The history, so no number out of this beacon is read as an audience.** It collected 800
pageloads between 2026-09-25 and 2026-10-02, stopped the day `92893ae` shipped the CSP, and
recorded nothing again until the `auto_install` repair. Of those 800, 790 were from the US and
630 self-referred, and the top paths are `/`, `/signin`, `/settings`, `/signup`,
`/recipes/new` and `/recipes/:id/edit`. That is one person developing. It also means the pages
denied analytics for eight days while 800 pageviews were in fact being counted.

**If it ever breaks again, dropping the page count is a reasonable answer.** The app's own
first-party events already answer more than it ever did, and `/cookies` and `/privacy` describe
it, so dropping it is a wording change as well as a dashboard one.

It is cookieless and sets no identifier, so the no-banner position is unaffected. The general
lesson stands: **a source scan cannot see anything the edge injects.** Anything switched on in
the Cloudflare dashboard is invisible to every test in this repo, so dashboard changes are a
documentation obligation, not just a config change.

The toggle is in the Cloudflare dashboard under Web Analytics, or via
`GET /accounts/<id>/rum/site_info/list` on the API.


### Security headers and the CSP

Every response the Worker returns carries a Content-Security-Policy and the cheap headers
(`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS). They are applied by
wrapping the whole router rather than per response, so a new route cannot ship without them.

**But the Worker does not see every request.** Cloudflare serves anything matching a real file
in `dist/` straight from its asset store and never invokes the Worker, so for a day the headers
reached `/help` and `/sitemap.xml` (no matching file, so they fall through) and never reached
`/`, which is `index.html`. `assets.run_worker_first: true` in `wrangler.jsonc` is what fixes that.

**It must be `true` and never a list of routes.** An array means "run the Worker first ONLY for
these paths", and every other path is then served by the asset layer alone, where
`not_found_handling` returns `index.html` without the Worker ever running. Setting
`["/", "/index.html"]` was tried and broke production inside a minute: `/sitemap.xml` began
answering with the SPA shell as `text/html`, and every shared recipe link lost its per-recipe
OpenGraph tags. Both still returned 200, so nothing looked wrong.

Two symptoms worth recognising, because both read as something else:

- **A header on some paths and not others, where the bare paths are exactly the ones that
  exist as files in `dist/`.** That is routing, not caching. Purging the cache does nothing,
  and the purge is what wasted the time here.
- **A Worker route answering `200` with the wrong `Content-Type`.** That is the asset layer's
  SPA fallback replying in the Worker's place, not a bug in the Worker.

After any change to the `assets` block, check a Worker-only route and not just the page you were
fixing:

```bash
curl -sS -D - -o /dev/null https://recipes.enamelvault.com/sitemap.xml | grep -i content-type
```

**`script-src 'self'` means no inline `<script>` anywhere.** A blocked inline script does not
warn, it silently never runs, which is why the theme bootstrap moved out of `index.html` into
`public/theme-init.js`. Two tests hold this: `worker/meta.test.ts` pins the policy's directives,
and `src/lib/browserStorage.test.ts` fails if an inline script reappears in `index.html`.

`style-src` has to allow `'unsafe-inline'`, because several components set a `style={{...}}`
attribute and CSP counts those as inline styles. That is a far weaker allowance than inline
script.

After a deploy, confirm the header is actually arriving:

```bash
curl -sS -D - -o /dev/null https://recipes.enamelvault.com/ | grep -i content-security-policy
```

If a page ever half-works in production, check the browser console for a CSP violation before
assuming a code bug: a violation reads as "Refused to load/execute", names the directive, and
is the fastest possible diagnosis once you think to look.

### The history scrub: what is actually still exposed, measured 2026-10-15

**Read this before writing to GitHub Support, because the handover's version of it was wrong,**
and a privacy request that overstates its facts is one a support engineer checks, disproves and
deprioritises. Every line below is a measurement with the command that made it.

**What is NOT exposed.** The live history is clean: no email address other than Aayush's own and
automated `noreply@` attribution trailers appears in any commit message reachable from `master`.

```bash
git log --all --format='%B' | grep -oiE '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' | grep -viE 'aayus\.pok@gmail\.com|noreply|@enamelvault\.com|example\.(com|dev)' | sort -u
```

Nor is it in the three merged pull requests. `refs/pull/N/head` lives for ever on GitHub, which
normally keeps old objects alive; but all three PR heads are commits that are STILL in the
current history (`git cat-file -e <sha>` succeeds for each), so the rewrite never touched them
and they hold nothing the live history does not.

**What IS exposed: unreachable objects, which GitHub serves until it garbage-collects.**

```bash
gh api repos/aayushpokhrel1/EnamelVault/commits/e7a329e --jq .sha
```

That still returns `e7a329ee57c7...` on a PUBLIC repository, while the object does not exist in
a fresh clone at all. The rewrite removed those commits from history and GitHub went on serving
them by SHA. That is the whole problem, and the only remaining one.

**But `e7a329e` itself contains nothing private.** Checked 2026-10-15: it touches only
`.graphifyignore`, its patch holds no address, its author and committer are Aayush's own gmail,
and the single email-shaped string in its message is an automated `noreply@anthropic.com`
trailer. **So do not tell Support that an address is readable at it.** It is evidence that
unreachable pre-rewrite objects are still served, and that is what to cite it as.

**Which SHA did carry the address is no longer knowable from here.** The local
`backup-before-msg-rewrite` branch held the pre-rewrite history and has been deleted, so there
is nothing left to enumerate from. That is an argument FOR the blanket GC rather than against
it: a targeted request cannot be aimed any more.

**NOT FILED, BY DECISION (2026-10-15): waiting for GitHub's own maintenance to collect it.**
Read the next two paragraphs before reopening that decision, because the obvious route is a
trap and the thing being waited for is real but unscheduled.

**DO NOT USE THE SUPPORT PORTAL'S "Deletes" CATEGORY. It is a REPOSITORY PURGE form.** This
file recommended it for one commit on 2026-10-15 and that was wrong. Picking it asks "Are you
having trouble deleting your repository?", "What is the URL of the repository you would like to
delete?", "Are you trying to purge a repository that has already been deleted?" and then a
confirmation whose own words are "Once the repository is purged, it cannot be restored". That
is a different operation on a live repository with six months of work in it. **Back out of that
form rather than answering it.** The other categories (invitations, migration and locked state,
restoration, transfer, repository features, log request, access issues, remove LFS objects) do
not describe removing unreachable objects either, which is why the request has no obvious home
and why waiting was chosen instead.

**What waiting is actually waiting for.** GitHub runs its own repository maintenance, and
unreachable objects stop being served once it collects them; there is no published schedule and
no notification, so it is a real mechanism with an unknown date rather than a promise. That is
an acceptable trade here because the measurement below is one command and the exposure is one
commit nobody has a reason to look for. **If it has to be forced**, the route is NOT the Deletes
form: it is the privacy contact in GitHub's Privacy Statement, or a general support request
whose first line says both what you want and, explicitly, that the repository must NOT be
deleted.

**The standing check**, which is the only thing that resolves this either way:

```bash
gh api repos/aayushpokhrel1/EnamelVault/commits/e7a329e --jq .sha
```

While it returns a SHA, the objects are still being served. A 404 means the collection has
happened and this whole section can go.

**Forks: 0** as of 2026-10-15
(`gh api repos/aayushpokhrel1/EnamelVault --jq .forks_count`). GC of one repository does not
clear a fork network, so if that number is ever not zero, say so in the ticket.

**When they say it is done**, re-run the `gh api` command above. It must fail with a 404. Until
it does, nothing has changed, whatever the ticket says.

**Independently of all of it:** the address was public from 2026-09-25 to 2026-09-30. The person
it belongs to should be told, and no garbage collection undoes that.

### After a deploy, check that each host still serves ITS OWN app

Three HTML entries live at the repo root (`index.html`, `kitchen.html`, `admin.html`), and
Cloudflare's asset layer will serve `kitchen.html` for the path `/kitchen` unless told not to.
It was telling it not to from 2026-10-26 (`"html_handling": "none"` in `wrangler.jsonc`, pinned
by `worker/assets.config.test.ts`), after this shipped and ran unnoticed:

```bash
for p in /kitchen /admin /site; do curl -s "https://recipes.enamelvault.com$p" | grep -o '<title>[^<]*</title>'; done
```

**All three must print `<title>Family Recipes</title>`.** Before the fix they printed the
kitchen app, the console and the marketing template, and `/kitchen` is a REAL route in the
family app, the "My Kitchen" link in its own nav: a cook who reloaded that page or opened it in
a new tab got the professional kitchen app answering "That page is not here".

**No test in this repo can catch the behaviour**, only the configuration. React-router never
asks the server, so every click-through and the whole unit suite pass while a full page load is
broken. That is why this check is a deploy step rather than a test, and why it was found by
walking the app on a fresh account rather than by CI.

### A white page with 403s on every asset is the automated browser, not this site (seen once)

Seen 2026-10-26 while walking production in an automated browser: `kitchen.enamelvault.com`
returned its HTML with **200** and **403 on every subresource** (`theme-init.js`, both JS
bundles, the CSS, a preloaded font) plus Cloudflare's own `/cdn-cgi/rum`. The page rendered
white. A reload a minute later was normal, with the same asset hashes.

**It was not this code and not Cloudflare, and the second half is measured.** The Worker returns
no 403 anywhere (`grep -n "403" worker/*.ts` finds nothing outside tests) and never sees
`/cdn-cgi/rum`. `curl` fetched every blocked URL with 200 at the same moment, including with the
blocked client's own user agent. And `firewallEventsAdaptive` over the whole zone for
21:20-21:35 UTC returns **zero events**, so no WAF rule, Bot Fight Mode or rate limit fired.

What remains is the browser itself: each 403 carried `net::ERR_ABORTED`, the host was one that
browser had not visited before in that session, and the two hosts it had been driving for an
hour were unaffected. That is an automation site-permission gate refusing subresources after
allowing the navigation, not a property of this site. **A human visitor cannot hit it.**

**Why this entry still exists, having turned out to be nothing:** the next session to walk
production in a browser will see the same white page and start debugging the kitchen app. The
useful fingerprint is `ERR_ABORTED` beside each 403 and a clean `curl` for the same URL. If
those two do NOT hold, it is a different incident and Security Events is then worth reading,
with the query in this repo's history (`6c73667`).

### Known standing risks

- **A FAMILY INVITE CODE CANNOT BE REVOKED FROM THE APP, and it never expires.** Every member
  sees the code on `/families` with a Copy button, `families_member_read` is what shows it to
  them, and `family_name_for_code` names the family to anyone holding it before they sign in.
  The only revocation is `rotateInviteCode` in `src/lib/api/families.ts`, which is correct and
  **has no caller anywhere in the UI**: migration `0038` calls it "the revocation", which is
  true of the function and not of the product. So a code that is forwarded, screenshotted or
  left in an old message works for ever. The kitchen app's equivalent was given a seven-day
  lifetime in `0054` for exactly this reason; the family side has neither that nor a button.
  **What it needs is a decision, not a patch**: who may rotate (the policy says the owner),
  whether members keep seeing the code at all, and what the page says to someone whose link
  has just been retired.

- **Account 2FA is on for Google, Cloudflare, GitHub and Supabase** (done 2026-10-02;
  Cloudflare's was verified through the API, not taken on trust). That closes the single
  largest risk, which was that one Google account was the recovery route for all four.
  **Still open, in rough priority order:** a separate moderator-only account so that an XSS in
  the everyday session cannot list every email; a backup story, because `delete_user` is
  irreversible and a bad `UPDATE` in the SQL editor has no undo; a rate limit on the `admin`
  function, which `claim_extraction` already models for
  extraction; Supabase's leaked-password protection toggle; Dependabot; and an audit of
  Cloudflare API tokens and GitHub PATs.
- **No page makes a third-party request, and that is now load-bearing.** The typeface is
  served from `public/fonts/` (SIL Open Font License 1.1, text kept beside the files because
  redistribution requires it), after being moved off Google Fonts, which was disclosing every
  visitor's IP to Google. `src/pages/Cookies.tsx` states this in public, so reintroducing any
  external stylesheet, font, embed or script makes that page false and a consent banner
  arguable. `src/lib/browserStorage.test.ts` fails on any absolute-URL `<link>`, `<script src>`
  or CSS `url()`, which is the check that notices.
- **The AI import sends user content to another company**, and that is the only path by which
  user content leaves our own infrastructure. Today: **Google Gemini** for text, url and photo,
  **DeepSeek** only as the fallback when Gemini returns a status that can fix itself, and
  **Groq** for voice transcription. All three are named on `/privacy`. Changing `MODEL_BASE_URL`
  changes who receives a user's recipe, so that env var is a privacy decision, not a config
  value, and `supabase/processors.test.ts` is what now notices when the page disagrees with it.
- **DMCA designated agent is NOT registered.** `/terms` carries a copyright complaints route
  and acts on notices, which is the substance, but safe harbour under 17 U.S.C. 512(c) also
  requires a designated agent registered with the US Copyright Office
  (<https://dmca.copyright.gov>, $6, renew every three years). Until that is filed, a rights
  holder could in principle sue the operator directly for a user's infringing post rather than
  being limited to a takedown. Low exposure while Potluck is small, and it rises with every
  stranger who publishes.
- **The contact address `moderation@enamelvault.com` appears on all four public pages**, via
  `src/lib/legal.ts`. A data protection policy naming a dead mailbox is worse than one naming
  none, so if inbound mail routing changes, that constant and `MODERATION_EMAIL` move together.
