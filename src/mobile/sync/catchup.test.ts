import { describe, it, expect, beforeEach } from "vitest";
import type { Recipe } from "../../lib/api/types";
import type { Store } from "../store/types";
import { createMemoryStore } from "../store/memory";
import { enqueue } from "./outbox";
import type { Intent } from "./outbox";
import type { ServerRecipe } from "./conflict";
import type { CatchUpRemote } from "./catchup";
import { catchUp, lastCaughtUpAt, localDate, myFamilies, weekWindow } from "./catchup";

const recipe = (id: string, overrides: Partial<Recipe> = {}): ServerRecipe => ({
  recipe: {
    id,
    family_id: "family-1",
    author_id: "cook-1",
    title: `Recipe ${id}`,
    story: null,
    provenance: null,
    servings: 4,
    prep_minutes: 10,
    cook_minutes: 20,
    visibility: "family",
    source_url: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-11-01T09:00:00.000Z",
    source_recipe_id: null,
    source_cook_name: null,
    adapted_at: null,
    removed_at: null,
    removed_reason: null,
    ...overrides,
  },
  ingredients: [{ position: 0, quantity: "200", unit: "g", item: "lentils" }],
  steps: [{ position: 0, text: "Rinse" }],
  authorName: "Asha",
});

const remote = (overrides: Partial<CatchUpRemote> = {}): CatchUpRemote => ({
  listFamilies: async () => [],
  listRecipes: async () => [],
  listPlanItems: async () => [],
  ...overrides,
});

const intent = (overrides: Partial<Intent> = {}): Intent => ({
  id: "intent-1",
  kind: "edit",
  recipeId: "r1",
  baseUpdatedAt: "2026-11-01T09:00:00.000Z",
  payload: { family_id: "family-1", title: "Mine", prep_minutes: null, cook_minutes: null, visibility: "family", ingredients: [], steps: [] },
  createdAt: "2026-11-02T10:00:00.000Z",
  state: "queued",
  error: null,
  ...overrides,
});

const NOW = new Date("2026-11-02T15:00:00.000Z");

describe("catchUp", () => {
  let store: Store;
  beforeEach(() => {
    store = createMemoryStore();
  });

  it("pulls every recipe the cook can read, from every family", async () => {
    const result = await catchUp(
      store,
      remote({ listRecipes: async () => [recipe("r1"), recipe("r2", { family_id: "family-2" })] }),
      NOW,
    );

    expect(result.pulled).toBe(2);
    expect((await store.all("recipes")).map((row) => row.id).sort()).toEqual(["r1", "r2"]);
    expect(await store.get("recipe_ingredients", "r1:0")).toMatchObject({ item: "lentils", recipe_id: "r1" });
    expect(await store.get("recipe_steps", "r2:0")).toMatchObject({ text: "Rinse" });
  });

  it("a recipe the cook can no longer read is deleted from the device", async () => {
    await store.put("recipes", { id: "gone", title: "Left the family" });
    await store.put("recipe_ingredients", { id: "gone:0", recipe_id: "gone", position: 0, item: "secret" });

    const result = await catchUp(store, remote({ listRecipes: async () => [recipe("r1")] }), NOW);

    expect(result.dropped).toBe(1);
    expect(await store.get("recipes", "gone")).toBeNull();
    // Its children go with it: a private copy of the ingredients is still a private copy.
    expect(await store.get("recipe_ingredients", "gone:0")).toBeNull();
  });

  it("a recipe created offline is never dropped for being absent from the server", async () => {
    await store.put("recipes", { id: "local:abc", title: "Not sent yet" });
    const result = await catchUp(store, remote(), NOW);

    expect(result.dropped).toBe(0);
    expect(await store.get("recipes", "local:abc")).not.toBeNull();
  });

  it("a local row with a pending edit is not overwritten by the server's copy", async () => {
    await store.put("recipes", { id: "r1", title: "Mine, half typed" });
    await enqueue(store, intent({ recipeId: "r1" }));

    const result = await catchUp(store, remote({ listRecipes: async () => [recipe("r1")] }), NOW);

    expect(result.pulled).toBe(0);
    expect((await store.get("recipes", "r1"))?.title).toBe("Mine, half typed");
    expect(result.dropped).toBe(0);
  });

  it("the families are pulled, so a fresh account can create its first recipe offline", async () => {
    // Derived from the recipes on the device, this would be empty for a cook whose family is
    // new, and their first recipe could only be made online.
    await catchUp(
      store,
      remote({ listFamilies: async () => [{ id: "family-1", name: "Pokhrel", role: "owner" }] }),
      NOW,
    );
    expect(await myFamilies(store)).toEqual([{ id: "family-1", name: "Pokhrel", role: "owner" }]);
  });

  it("a family the cook has left is gone from the device", async () => {
    await store.put("families", { id: "old", name: "Someone else", role: "member" });
    await catchUp(store, remote(), NOW);
    expect(await myFamilies(store)).toEqual([]);
  });

  it("plan items are replaced, not merged", async () => {
    await store.put("meal_plan_items", { id: "old", plan_id: "p9", recipe_id: "r9", day: "2026-01-01", meal: "dinner" });

    await catchUp(
      store,
      remote({
        listPlanItems: async () => [{ id: "i1", plan_id: "p1", recipe_id: "r1", day: "2026-11-03", meal: "dinner" }],
      }),
      NOW,
    );

    expect((await store.all("meal_plan_items")).map((row) => row.id)).toEqual(["i1"]);
  });

  it("the week window is built from the device's local date, never from UTC", async () => {
    // Both ends of a local day. toISOString() reports the next day for the late one in every
    // zone west of UTC, and the previous day for the early one in every zone east of it, so
    // between them these two pin the rule everywhere except exactly UTC, where no test can
    // tell the two apart.
    expect(weekWindow(new Date(2026, 10, 2, 23, 30))).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(weekWindow(new Date(2026, 10, 2, 0, 30))).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(localDate(new Date(2026, 10, 2, 23, 30))).toBe("2026-11-02");
  });

  it("the window the server is asked for is the window that was computed", async () => {
    let asked: [string, string] | null = null;
    await catchUp(
      store,
      remote({
        listPlanItems: async (from, to) => {
          asked = [from, to];
          return [];
        },
      }),
      new Date(2026, 10, 2, 9, 0),
    );
    expect(asked).toEqual(["2026-11-02", "2026-11-08"]);
  });

  it("lastCaughtUpAt is only advanced when the pull completed", async () => {
    expect(await lastCaughtUpAt(store)).toBeNull();

    await expect(
      catchUp(store, remote({ listPlanItems: async () => { throw new Error("offline"); } }), NOW),
    ).rejects.toThrow("offline");
    expect(await lastCaughtUpAt(store)).toBeNull();

    const result = await catchUp(store, remote(), NOW);
    expect(await lastCaughtUpAt(store)).toBe(result.at);
    expect(result.at).toBe(NOW.toISOString());
  });
});
