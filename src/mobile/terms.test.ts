import { describe, it, expect } from "vitest";
import { TERMS_VERSION } from "../lib/legal";
import { needsTerms } from "./terms";

describe("needsTerms", () => {
  it("someone who accepted the current version is through", () => {
    expect(needsTerms({ terms_accepted_at: "2026-10-12T00:00:00.000Z", terms_version: TERMS_VERSION })).toBe(false);
  });

  it("someone who accepted an older version is asked again", () => {
    expect(needsTerms({ terms_accepted_at: "2026-09-01T00:00:00.000Z", terms_version: "2026-09-01" })).toBe(true);
  });

  it("someone who has never accepted is asked", () => {
    expect(needsTerms({ terms_accepted_at: null, terms_version: null })).toBe(true);
  });

  it("a date with no version is asked, because the version is the evidence", () => {
    // terms_accepted_at alone says a person pressed something, not what they were shown.
    expect(needsTerms({ terms_accepted_at: "2026-10-12T00:00:00.000Z", terms_version: null })).toBe(true);
  });

  it("a profile that could not be read is asked, not waved through", () => {
    // The phone is offline first, so "no profile yet" is a normal state here in a way it
    // never was on the web. Defaulting it to accepted would open a gate nobody opened.
    expect(needsTerms(null)).toBe(true);
  });

  it("uses the same constant the web gate uses", () => {
    // Not a copy. A second copy of a consent version drifts, and the version is the only
    // evidence of what somebody actually agreed to.
    expect(needsTerms({ terms_accepted_at: "2026-10-12T00:00:00.000Z", terms_version: "2026-10-11" })).toBe(
      TERMS_VERSION !== "2026-10-11",
    );
  });
});
