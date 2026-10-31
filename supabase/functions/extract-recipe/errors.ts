// The cook-facing wording for a failed model call. No Deno or DOM specifics so it runs
// unchanged under vitest (Node) and the Deno edge runtime, the same arrangement as
// retry.ts, jsonld.ts and htmlText.ts.

// What the COOK sees. The provider's own error body is for the logs: a QuotaFailure object on
// screen in the middle of adding a recipe tells them nothing they can act on, and every one of
// these states has a human answer, which is usually "type it in instead".
export function humanModelError(status: number): string {
  if (status === 429) {
    return "The recipe assistant has hit its limit for the moment. Wait a minute and try again, or type the recipe in by hand.";
  }
  if (status === 503 || status === 502 || status === 504) {
    return "The recipe assistant is busy right now. Try again in a moment, or type the recipe in by hand.";
  }
  if (status === 401 || status === 403) {
    return "The recipe assistant is not set up correctly. This one is not your fault: the key needs looking at.";
  }
  // A 404 FROM AN OPENAI-COMPATIBLE PROVIDER MEANS THE MODEL ID IS NOT AVAILABLE TO THIS KEY,
  // which is configuration and not the cook's input. It fell through to "could not read that"
  // until 2026-10-31, so a provider retiring a model id, or moving it off a free tier, told
  // every cook that their own perfectly good recipe was unreadable and to try again, which
  // could never work. Found walking the AI import locally, where OpenRouter had done exactly
  // that to the model the dev env named.
  //
  // Model ids get retired on a vendor's schedule, so this is a state to expect rather than a
  // freak one, and MODEL_NAME lives in a Supabase secret where no test can see it.
  if (status === 404) {
    return "The recipe assistant is not set up correctly. This one is not your fault: the model it was asked for is not available.";
  }
  return "The recipe assistant could not read that. Try again, or type the recipe in by hand.";
}

