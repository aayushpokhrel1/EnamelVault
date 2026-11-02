import { describe, it, expect, beforeEach } from "vitest";
import type { Store } from "./store/types";
import { createMemoryStore } from "./store/memory";
import { enqueue, markConflicted, markFailed, markSent } from "./sync/outbox";
import type { Intent } from "./sync/outbox";
import { storeNameFor, signOutBlocked } from "./account";

const intent = (overrides: Partial<Intent> = {}): Intent => ({
  id: "intent-1",
  kind: "edit",
  recipeId: "recipe-1",
  baseUpdatedAt: "2026-11-01T09:00:00.000Z",
  payload: { family_id: "family-1", title: "Dal", prep_minutes: null, cook_minutes: null, visibility: "family", ingredients: [], steps: [] },
  createdAt: "2026-11-02T10:00:00.000Z",
  state: "queued",
  error: null,
  ...overrides,
});

describe("storeNameFor", () => {
  it("two accounts get two different local databases", () => {
    const a = storeNameFor("11111111-2222-3333-4444-555555555555");
    const b = storeNameFor("99999999-8888-7777-6666-555555555555");
    expect(a).not.toBe(b);
  });

  it("is derived from the user id and nothing else", () => {
    // The same cook after changing their email must open the same database. Nothing but the
    // id goes into the name, so there is nothing else that could move.
    expect(storeNameFor("11111111-2222-3333-4444-555555555555")).toBe(
      storeNameFor("11111111-2222-3333-4444-555555555555"),
    );
    expect(storeNameFor("ABCDEF00-0000-0000-0000-000000000000")).toBe(
      storeNameFor("abcdef00-0000-0000-0000-000000000000"),
    );
  });

  it("cannot be talked into a path", () => {
    // The whole shape, not an absence of slashes: the name ends in ".db" on purpose, so an
    // assertion about dots alone would have to know which dot it meant.
    expect(storeNameFor("../../etc/passwd-00")).toMatch(/^familyrecipes-[a-z0-9-]+\.db$/);
    expect(storeNameFor("11111111-2222-3333-4444-555555555555")).toMatch(/^familyrecipes-[a-z0-9-]+\.db$/);
    expect(() => storeNameFor("")).toThrow();
    // A user id that sanitises to nothing must not quietly become everyone's database.
    expect(() => storeNameFor("../..")).toThrow();
  });
});

describe("signOutBlocked", () => {
  let store: Store;
  beforeEach(() => {
    store = createMemoryStore();
  });

  it("is false on an empty outbox", async () => {
    expect(await signOutBlocked(store)).toBe(false);
  });

  it("is true while a queued intent is waiting", async () => {
    await enqueue(store, intent());
    expect(await signOutBlocked(store)).toBe(true);
  });

  it("is true for a failed intent, which is still unsent work", async () => {
    await enqueue(store, intent());
    await markFailed(store, "intent-1", "offline");
    expect(await signOutBlocked(store)).toBe(true);
  });

  it("is true for a conflicted intent, because discarding it is the same loss", async () => {
    await enqueue(store, intent());
    await markConflicted(store, "intent-1");
    // It is not pending, so a check written on pending alone would wave this through and
    // throw away an edit the cook was in the middle of deciding about.
    expect(await signOutBlocked(store)).toBe(true);
  });

  it("is false once the work has landed", async () => {
    await enqueue(store, intent());
    await markSent(store, "intent-1", "recipe-1");
    expect(await signOutBlocked(store)).toBe(false);
  });
});
