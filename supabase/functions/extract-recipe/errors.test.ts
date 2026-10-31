import { describe, it, expect } from "vitest";
import { humanModelError } from "./errors";

// The bug these pin: the provider's raw error body used to reach the cook's screen. A real one
// looked like `model error 429: [{ "error": { "code": 429, ... "QuotaFailure" ... } }]` in the
// middle of adding a recipe, which says nothing a cook can act on.
describe("humanModelError", () => {
  it("never leaks provider jargon", () => {
    for (const status of [429, 500, 502, 503, 504, 401, 403, 400, 418]) {
      const msg = humanModelError(status);
      expect(msg).not.toMatch(/quota|RESOURCE_EXHAUSTED|UNAVAILABLE|generativelanguage|\{|\}/i);
      expect(msg).not.toMatch(/\b\d{3}\b/); // no bare status codes
    }
  });

  it("always offers something the cook can do next", () => {
    for (const status of [429, 503, 500, 400]) {
      expect(humanModelError(status)).toMatch(/by hand|try again/i);
    }
  });

  it("tells a rate limit apart from a busy model, since the waits differ", () => {
    expect(humanModelError(429)).toMatch(/limit/i);
    expect(humanModelError(429)).toMatch(/wait a minute/i);
    expect(humanModelError(503)).toMatch(/busy/i);
  });

  // A misconfigured key is not the cook's fault and no amount of retrying fixes it, so the
  // wording must not send them in circles.
  it("says a key problem is not the cook's fault", () => {
    for (const status of [401, 403]) {
      expect(humanModelError(status)).toMatch(/not your fault/i);
      expect(humanModelError(status)).not.toMatch(/try again/i);
    }
  });

  // THE STATUS THE MAP FORGOT. A 404 from an OpenAI-compatible provider means the model id is
  // not available to this key: a retired model, or one moved off a free tier, which is a thing
  // vendors do on their own schedule. It fell through to "could not read that. Try again",
  // which blames the cook's input for a configuration fault and offers advice that cannot
  // work. Found by walking the AI import on 2026-10-31, when OpenRouter did exactly that to
  // the model the local env named.
  it("says a missing model is not the cook's fault either", () => {
    expect(humanModelError(404)).toMatch(/not your fault/i);
    expect(humanModelError(404)).toMatch(/not available/i);
    expect(humanModelError(404)).not.toMatch(/could not read that/i);
    // No "try again": retrying a model that does not exist is a loop.
    expect(humanModelError(404)).not.toMatch(/try again/i);
  });

  it("has a sane answer for an unexpected status", () => {
    expect(humanModelError(418)).toMatch(/could not read that/i);
  });
});
