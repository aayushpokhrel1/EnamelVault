---
description: FamilyRecipes doc sweep: stale claims, one home per fact, and bloat
---

**This is the FamilyRecipes-specific sweep, and the one to run in this repo.** The user-level
`/update-docs` holds the same discipline without this project's commands or file routing; it is
a separate name on purpose, because while both were called `update-docs` the user-level one won
and this file never loaded.

Sweep the docs. **"Update the docs" means making them TRUE and keeping each fact in ONE place**,
not appending what shipped. Work through all of it, not the file you happen to have open.

## 1. Check the numbers against reality, never against the file

Run these and correct every doc that disagrees. A number nobody re-measured is the most common
stale claim here.

```bash
npx tsc -b && npm test
```

- unit test count and file count, from that run
- integration count: `npx vitest run tests/integration` (needs `SB_URL`, `SB_ANON_KEY`,
  `SB_SERVICE_KEY` from `npx supabase status -o env`)
- latest migration: `ls supabase/migrations | tail -1`, and what cloud has:
  `npx supabase migration list --remote`
- head commit and whether it is pushed: `git log --oneline -1`,
  `git log --oneline origin/master..HEAD`
- what production is actually serving: `curl -s https://recipes.enamelvault.com/health/version`
- edge function count and deploy state: `npx supabase functions list`

## 2. Route every fact to its ONE home

`CLAUDE.md` has the routing table; it is the authority, not this file. The short form:

| Fact | Home |
| --- | --- |
| What the project is, the stack, the doc map | `README.md` |
| Product truth, decisions, roadmap, what is deferred **and why** | `PRODUCT.md` (+ vault copy) |
| The visual system | `DESIGN.md` |
| Running, verifying, CI, deploying, monitoring, env traps, landmines | `docs/OPERATIONS.md` |
| A rule about specific code | a comment AT that code |
| A lesson useful on a DIFFERENT project | the Obsidian vault |
| The design of one feature | `docs/superpowers/specs/` |
| Current state: commit, versions, counts, what is half-done, what is next | `HANDOVER.md` |
| A dated narrative of what you did today | **nowhere.** `git log` holds it |

**Move, do not copy.** If a fact is in two docs, delete it from the one that is not its home and
leave a pointer only if a reader would otherwise not find it.

## 3. Hunt the bloat, specifically

- **`HANDOVER.md` line count.** `src/handover.budget.test.ts` fails over the budget and on
  dated section headings. If it is red, the fix is to MOVE content to its home or delete the
  history, **never to raise the budget**. That test's comment and `CLAUDE.md` carry why; this
  file does not repeat it.
- **Explanations told more than once.** Grep a distinctive phrase from any long explanation
  across all docs. Keep the copy in its home, and let the others point at it:
  `grep -rn "<phrase>" README.md PRODUCT.md DESIGN.md CLAUDE.md docs/ HANDOVER.md`
- **The same thing described twice inside one file** (README had the kitchen pipeline twice).
- **A doc restating a rule that has a code comment and a test.** The code comment and the test
  are the real homes; a prose copy is the one that goes stale.
- **"Still open" items that are closed**, and closed items still written as open. Check against
  the code, not against another doc.

## 4. Verify a claim before you keep it

Three claims in this repo were false while being repeated in two files each: that `/terms` had
seven open gaps (closed), that a third party's email was readable at `e7a329e` (it is not), and
that the Potluck byline rule was pinned by a test (it was not, until one was written). **If a
doc asserts something checkable, check it in this sweep.** A sentence that survives a sweep
unverified is how the next session gets it wrong.

## 5. Report and commit

Say what was stale, what moved, and what was cut. Then commit the tracked docs. `HANDOVER.md`
and `PRODUCT.md` are gitignored: sync `PRODUCT.md` to the vault instead
(`Projects/FamilyRecipes/product/PRODUCT.md`), through WSL, with the content in a FILE rather
than on the command line.
