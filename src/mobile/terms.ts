import { TERMS_VERSION } from "../lib/legal";

export { TERMS_VERSION };

/** Only the two columns the decision rests on, so a test does not have to build a profile. */
export type TermsFacts = { terms_accepted_at: string | null; terms_version: string | null };

/**
 * The SAME comparison the web gate makes, against the same constant, which is why
 * TERMS_VERSION moved into lib/legal.ts: a second copy of a consent version is a copy that
 * drifts, and the version is the only evidence of what somebody actually agreed to.
 *
 * A profile that could not be read is NOT treated as accepted. The phone app is offline
 * first, so "no profile yet" is a normal state here in a way it never was on the web, and
 * defaulting it to accepted would let the cook past a gate nobody had opened.
 */
export function needsTerms(facts: TermsFacts | null): boolean {
  if (!facts) return true;
  if (facts.terms_accepted_at === null) return true;
  return facts.terms_version !== TERMS_VERSION;
}
