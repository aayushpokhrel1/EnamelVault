# The phone app

Design, 2026-11-02. Brainstormed with Aayush; every decision below is attributed, because the
ones that are mine are the ones worth arguing with.

## Why this exists

The family app already works on a phone. A browser tab is not where cooking happens.

Four moments were named, and all four are the point of the app rather than a ranked list:

1. **Cooking** from a recipe with the phone propped up and your hands covered in flour.
2. **Capturing** a recipe where it turns up: a handwritten card, a page, a reel someone sent,
   someone telling you out loud.
3. **Shopping** the week's plan, in a shop, where the signal is bad.
4. **Browsing** Potluck on the sofa.

Four things the browser cannot do, and Aayush wants all four:

- **Work with no signal.** A kitchen with bad wifi and a shop with none are the two places the
  app is for.
- **Live in the share sheet.** Capture stops being something you remember to do later.
- **Ring with the screen off.** A timer that fires while the phone is locked is the one thing
  Cook Mode cannot do today. `PRODUCT.md` defers Web Push for this; a native app gets it with
  a local notification and no server involved at all.
- **Camera and microphone, properly.** Point at a card; dictate with your hands busy; be read
  to and say "next".

## What it is

A **React Native app**, a fourth client beside the family app, the kitchen app and the
moderation console, talking to the same Supabase. Aayush's call, recorded in `PRODUCT.md` on
2026-11-01.

It is a client for the **family** app only. The kitchen app and the console stay web-only, and
nothing in this app may import from `src/kitchen/` or `src/admin/`; `supabase/kitchen_seal.test.ts`
already holds that line for the web apps and must be extended to hold it for this one.

## Goals

**The first release ships all three screens**, which Aayush chose over a narrower start:

- **The shelf.** Everything on the device, with its sync state visible: what is here, what is
  queued to send, when it last caught up.
- **The recipe.** Readable and editable with no signal, including the moment where a queued
  edit meets a recipe that moved underneath it.
- **Cook mode.** One step at a time, big type, timers that ring with the phone locked.

**Sign-in is email, Google and Apple**, all three in the first release. Aayush's call. Apple
requires Sign in with Apple in any app that offers another third-party sign-in, so Google in
the first release means Apple in it too, and doing them together means App Store review is
never blocked on identity work.

**Offline means editing, not caching.** Aayush chose the full version with his eyes open after
being told it is the expensive one. The device holds your families' recipes, your saved vault
and this week's plan. Potluck stays online-only and says so plainly when there is no signal.

**Conflicts warn and let you choose.** This is not a new decision: `0034_pending_edits.sql`
settled it for web drafts, rejecting silent last-write-wins because it "would quietly destroy
someone's work", and rejecting a lock because a forgotten draft holds one forever. The phone
inherits that rule so both clients behave the same way.

## Non-goals for the first release

- The share sheet, voice capture and camera capture. Named as reasons the app exists; not in
  the first release.
- Shopping-list ticks offline, and the meal plan beyond "this week's plan is on the device".
- Potluck as a native feed. It is reachable and online-only.
- The kitchen app and the console, in any form.
- Android. Not refused, but Aayush has an iPhone to test on and the first release is aimed at
  it. Nothing here should make Android harder later, and React Native does not.

## Anti-goals

These are failures even if everything works. Aayush named the first three.

- **It loses someone's words.** The project exists to keep family recipes. A sync bug that eats
  a grandmother's phrasing is not recoverable by shipping a fix.
- **It is slower than the website.** A native app that opens a recipe more slowly than Safari
  does has no reason to exist. Offline-first builds get here through a cold start nobody
  measured.
- **It feels like a website in a box.** Web gestures, web scrolling, a web date picker. People
  can tell within one screen, and then they stop trusting it with what they care about.

**Deliberately not an anti-goal: becoming a fourth thing to maintain.** Aayush was offered that
one and left it unticked, which is consistent with the code-sharing decision below. Some
duplication between the web app and this one is accepted on purpose.

## Decisions already made

### Code lives in this repo and shares types only

Aayush's call, from a menu that included sharing `src/lib/api/` wholesale.

What crosses the line is the **row and payload types** in `src/lib/api/types.ts` plus pure
helpers that touch no client (`normalizeItem`, `quantity`, `units`, `primaryIngredients` and
their kind). Those cannot drift, because the typecheck fails when they do.

The **data layer is the app's own, written local-first.** The reason is not laziness about
reuse: `src/lib/api/` assumes every write reaches Supabase and either succeeds or throws. A
local-first client writes to the device first and reconciles later. Sharing one module across
both would mean a file with two modes in it, which is worse than two files.

**Non-negotiable consequence:** the web app's behaviour must not change to serve the phone.
`src/lib/api/` keeps its contract.

### The queue is a queue of intents, and it replays through the real write path

**My call, not Aayush's.** A queued edit carries the recipe's `updated_at` from when the edit
began, exactly as `recipe_drafts.base_updated_at` does today, and it lands by calling
`publish_recipe_edit`, not by writing to `recipes` directly.

The reason is in `0034`'s own header: `enforce_publish_rules` is a **trigger on the table**, so
the rule fires without the function knowing it exists, and a second write path would be a
second place for that rule to be forgotten. This repo has paid for a rule living in two places
twice already (`0009` and `0019` both exist for that reason).

### A refused write must surface, never vanish

**My call, and the most important line in this document.**

`CLAUDE.md` records that **a write refused by RLS is not an error**: the policy does not reject
the row, it fails to match one, so the update affects zero rows and resolves with
`error: null`. Three bugs shipped from this in one day. `tests/integration/silent_refusals.test.ts`
pins the behaviour.

An offline queue is a machine for turning that into silent data loss: it replays a write hours
later, with nobody watching, and a refusal looks exactly like a success. So:

- **Every queued operation must confirm what it wrote** and treat zero rows as a failure, which
  is the same `.select()`-and-throw rule `src/lib/api/` already follows.
- **A failed replay is shown to the person**, on the shelf and on the recipe. It must never be
  retried forever in silence or dropped.
- The phone is not a trust boundary. RLS stays the entire security model; the queue only
  changes **when** a write is attempted, never **whether** it is allowed.

### No third party gets data from this app

**My call, and it has a test behind it.** `src/pages/Cookies.tsx` states in public that no page
makes a third-party request, `Privacy.tsx` names every processor the code can reach, and
`supabase/processors.test.ts` fails the build when a reachable provider is unnamed.

So: **no analytics SDK, no crash reporter, no attribution library.** Adding one makes a public
document false. If crash reporting is ever wanted, it is a privacy decision and a documentation
change first, and a dependency second.

The App Store privacy labels must agree with `Privacy.tsx`, which today names **Google Gemini**
(text, url and photo import), **DeepSeek** (fallback) and **Groq** (voice transcription).

### Terms acceptance carries over, and this app needs its own guard

**My call.** The account is the same account, so an acceptance recorded by the web app counts
here; there is no second gate and no second version constant.

But `CLAUDE.md` is blunt about the failure mode: a guard covering one of several apps **reports
success for the app it cannot see**, and the kitchen app shipped its entire surface ungated with
the suite green because `src/routes.terms.test.ts` only ever read the family router. This app
is the fourth router. It needs its own guard test, asserting that no route that **does**
something escapes the gate.

### Sessions

The three web apps share one session through a cookie on `.enamelvault.com`
(`src/lib/sessionCookie.ts`). **That mechanism is web-only and does not apply here.** The phone
keeps its Supabase session in the platform's secure storage. One sign-in on the phone has
nothing to do with a sign-in in Safari, and that is correct.

### Build and distribution

- The development machine is **Windows** and the test device is an **iPhone**. Building for iOS
  needs macOS, so iOS builds go through a cloud build service. This is a constraint, not a
  preference.
- A **free Apple ID** signs builds onto Aayush's own iPhone, and local notifications work on
  one, so the timer work is not blocked on paying. The **$99 Apple Developer Program** is needed
  for TestFlight, the App Store and remote push. There is no individual discount: the fee waiver
  is for nonprofits, schools and government entities as legal entities shipping free apps.
- Aayush will get the account when someone other than him needs to hold the app.

## Constraints

- **Apply a migration to cloud before the frontend that needs it**, per `CLAUDE.md`. If this app
  needs schema (it should not; see below), the migration ships first and separately.
- **This app should need no migration at all.** Everything the first release does is already
  expressible: recipes, drafts with `base_updated_at`, `publish_recipe_edit`, meal plans. A
  migration appearing in this work is a signal to stop and ask why.
- **Verify with `npx tsc -b && npm test`.** Note that `npm test` runs
  `vitest run src supabase worker scripts`, so **a top-level directory for this app would hold
  tests that never run**. That is exactly why kitchen code lives under `src/`.
- Deploys for this project changed on 2026-11-02: Supabase CLI v3 made `db push` target the
  local stack by default and renamed `--linked` to `--remote`. `docs/OPERATIONS.md` carries it.

## Settled after the builder review

A reviewer read this document cold and came back with twenty questions. Two were Aayush's and
are answered here in his words; the rest are my calls, listed so they can be argued with.

**Aayush's answers:**

- **A new recipe can be written with no signal** and becomes real on sync. He chose this over
  edit-only with the cost stated. It is the largest single piece of the sync engine: a local
  row needs an id before the server has given it one, that temporary id has to be reconciled
  afterwards, and the same queued create must not produce two recipes if it is replayed.
- **A conflict shows both versions and you keep one.** Not a hand merge, and not "keep theirs
  and hold yours as a draft". Note the tension with the anti-goal, and it is deliberate: the
  version you do not keep is gone, so the screen has to make it obvious which is which and
  whose is whose before you tap. The losing version should be recoverable for as long as that
  costs nothing, but the product promise is "you chose", not "nothing is ever lost".

**My calls, settled rather than asked:**

- **Scope on the device:** every family the account belongs to, not an active-family mode. The
  web app has no such mode and the phrase was "your families' recipes". The saved vault is the
  `saves` data, a distinct set from your families' recipes, and both are synced.
- **This week's plan is read-only on the phone** in the first release, which follows from
  shopping-list ticks being a non-goal. The week boundary is whatever the web app already uses;
  the phone must not invent a second rule.
- **Cook mode works offline for any recipe on the device**, not only ones you have opened. The
  whole point of holding your families' recipes is that you never discover a gap at the hob.
- **Timers are parsed from the step text**, as the web app already does, and the clock is a
  wall-clock end time held above the view layer. `docs/superpowers/specs/2026-10-15-cook-mode-timers-design.md`
  settled this once and the reasoning carries: a timer must have rung on time rather than
  resuming when you come back. On the phone the end time is also a scheduled local
  notification, and running timers are re-scheduled on launch, because iOS drops pending
  notifications in cases the app does not control.
- **Sign-in only, for accounts that already exist.** Sign-up, email confirmation and password
  reset stay on the web for the first release. Apple's in-app account-deletion requirement
  attaches to apps that offer account creation, so not offering it keeps a whole obligation out
  of the first submission.
- **The terms gate can accept in-app.** `record_terms_acceptance` exists (`0047`), so a cook
  who has never accepted is shown the document and can accept there. A guard whose failure
  state is a dead end is not a guard.
- **A speed target, since "slower than the website" needs a number:** on Aayush's own iPhone,
  opening a recipe from the shelf must be at least as fast as the web app doing the same thing
  on the same device, measured cold, with the measurement written down. The web app is the
  baseline because it is the thing people will compare it to.
- **Code lives under `src/`** (`src/mobile/` unless the toolchain forbids it), because
  `npm test` runs `vitest run src supabase worker scripts` and a top-level directory would hold
  tests that never run. If the toolchain genuinely cannot live there, the test globs change in
  the same commit, never later.
- **Same Supabase project and the same publishable key** as the web apps. It is the same data
  and the same policies; a separate project would be a second source of truth.
- **Minimum iOS: the two most recent major versions**, and the bundle identifier is fixed
  before the first build, because changing it later loses the installed app's local data.
- **Sign-out with queued edits warns and does not discard them.** The queue is held per account
  and survives. Silent loss at sign-out is the anti-goal wearing a different hat.
- **The design reference is the web app's own screens plus `DESIGN.md`.** iOS conventions win
  where they disagree with the web layout, but the palette, the typeface and the plate metaphor
  are the brand and hold.

## What is left to the builder

Genuinely open, and a competent builder should decide these rather than ask:

- **The React Native toolchain**: bare or managed, which cloud build service, which navigation
  library, which state container. The only hard requirement is that iOS can be built from
  Windows and that the result can be installed on Aayush's own iPhone.
- **The on-device store.** SQLite is the obvious answer; the schema, the outbox table and how
  the queue is drained are the builder's design.
- **The sync algorithm's shape**, within the rules above: what triggers a catch-up, how a
  partial sync is resumed, how deletions propagate.
- **How "feels native" is achieved**: the navigation idioms, the gestures, the pickers. The
  `DESIGN.md` palette and typeface are the brand and should hold; iOS conventions win over web
  conventions when they disagree.
- **The test strategy for an RN app**, except the two tests this document requires: the router
  guard, and a test that a replay refused by the database surfaces rather than vanishing.

## What would make this document wrong

If offline-first turns out to cost more than the three screens are worth, the honest retreat is
the one Aayush rejected: read-everything, edit-online-only, with the shopping list the single
offline-writable thing. That is a smaller app and a real one. It is written here so that the
retreat is a decision rather than a drift.
