import { expect, it } from "vitest";
import { fingerprint, prose, sourceText } from "../lib/termsFingerprint";

// TermsGate stores which version of the terms somebody accepted, and re-asks when it changes.
// Edit the wording of Terms.tsx WITHOUT bumping TERMS_VERSION and two things happen: nobody is
// ever re-asked, and the `terms_accepted_at` row claims a person agreed to text they never saw.
// The second one is the problem, because that row is the only evidence that consent was given.
//
// The comment at the top of both files has said "bump this" since the gate was written. That is
// the least reliable form of a rule, as this project has already proved three times: the
// failure mode is not ignorance, it is not re-reading. So this test fingerprints the prose and
// fails when the prose moved and the version did not.
//
// WHEN IT FAILS: bump TERMS_VERSION and TERMS_UPDATED, which both live in lib/legal.ts, and
// paste the hash the failure message prints into EXPECTED below. Three edits, one of which the
// failure hands you. That is deliberately slightly annoying: a terms change should cost a
// moment's thought, because it re-prompts every existing user.

// Bump alongside TERMS_VERSION. The failure message prints the value to paste here.
const EXPECTED = "e3f1a932";

it("re-prompts every user when the terms wording changes", () => {
  const actual = fingerprint(prose(sourceText("src/pages/Terms.tsx")));
  expect(
    actual,
    `Terms.tsx changed. Bump TERMS_VERSION and TERMS_UPDATED in lib/legal.ts, then set EXPECTED in this test to "${actual}".`,
  ).toBe(EXPECTED);
});

it("keeps the three places that record a terms change in step", () => {
  const version = /TERMS_VERSION = "([^"]+)"/.exec(sourceText("src/lib/legal.ts"))?.[1];
  const updated = /TERMS_UPDATED = "([^"]+)"/.exec(sourceText("src/lib/legal.ts"))?.[1];
  expect(version, "TERMS_VERSION must be an ISO date, so it sorts and is comparable").toMatch(
    /^\d{4}-\d{2}-\d{2}$/,
  );
  // The gate's version and the date shown to the reader must describe the same day, or the page
  // says one thing and the stored acceptance records another.
  const [y, m, d] = (version ?? "").split("-");
  const month = new Date(`${y}-${m}-02`).toLocaleString("en-GB", { month: "long" });
  expect(updated).toBe(`${Number(d)} ${month} ${y}`);
});

it("still carries the clauses the app's behaviour depends on", () => {
  // Not a style check. Each of these is load-bearing: the licence is what permits Potluck's
  // saved copies to exist at all, the allergen line is the one warning that can prevent harm,
  // and the governing-law and liability sections are what stop an unbounded claim. A future
  // tidy-up that shortens this page must not quietly drop one.
  // prose() for the same reason as the kitchen's copy of this test: JSX wraps sentences, and a
  // clause check that a re-wrap can turn red is a guard people learn to ignore.
  const terms = prose(sourceText("src/pages/Terms.tsx"));
  const missing = [
    ["a licence to display user content", /permission to store, copy, resize/i],
    ["the saved-copy licence Potluck relies on", /permission to save a copy/i],
    ["the allergen warning", /allerg/i],
    ["a minimum age", /at least 13/i],
    ["the warranty disclaimer", /warranties that can be disclaimed are disclaimed/i],
    ["a liability cap", /limited to one hundred US dollars/i],
    ["governing law", /State of Ohio/i],
    ["a copyright complaints route", /copyright/i],
  ]
    .filter(([, pattern]) => !(pattern as RegExp).test(terms))
    .map(([name]) => name);
  expect(missing).toEqual([]);
});

it("refuses to guess when two files could be the terms page", () => {
  // The repo holds src/pages/Terms.tsx AND src/kitchen/pages/Terms.tsx, and the glob sorts the
  // kitchen one FIRST. So the old sources.find(path.endsWith("pages/Terms.tsx")) would have
  // begun fingerprinting the kitchen's document the day that page was added: it fails once,
  // and pasting the printed hash in makes it green again while guarding nothing at all.
  //
  // The quiet version of that is the dangerous one, which is why ambiguity throws.
  expect(() => sourceText("pages/Terms.tsx")).toThrow(/matches 2 files/);
  expect(sourceText("src/pages/Terms.tsx")).toContain("Terms and acceptable use");
  expect(sourceText("src/kitchen/pages/Terms.tsx")).toContain("Terms for kitchens");
});
