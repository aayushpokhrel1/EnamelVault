import { describe, it, expect, beforeEach } from "vitest";
import type { Store } from "./store/types";
import { createMemoryStore } from "./store/memory";
import { enqueue } from "./sync/outbox";
import type { Intent } from "./sync/outbox";
import { recipeView } from "./recipe";

const intent = (overrides: Partial<Intent> = {}): Intent => ({
  id: "intent-1",
  kind: "edit",
  recipeId: "r1",
  baseUpdatedAt: "2026-11-01T09:00:00.000Z",
  payload: {
    title: "Dal, the way I make it",
    prep_minutes: 5,
    cook_minutes: 40,
    visibility: "private",
    ingredients: [{ position: 1, quantity: "1", unit: "tsp", item: "cumin" }],
    steps: [{ position: 0, text: "Rinse twice" }],
  },
  createdAt: "2026-11-02T10:00:00.000Z",
  state: "queued",
  error: null,
  ...overrides,
});

describe("recipeView", () => {
  let store: Store;
  beforeEach(async () => {
    store = createMemoryStore();
    await store.put("recipes", {
      id: "r1",
      title: "Dal",
      story: "From Nani",
      provenance: null,
      servings: 4,
      prep_minutes: 10,
      cook_minutes: 20,
      visibility: "family",
      source_cook_name: null,
    });
    // Written out of order on purpose: position is the order, not insertion.
    await store.put("recipe_ingredients", { id: "r1:1", recipe_id: "r1", position: 1, item: "cumin", optional: 1 });
    await store.put("recipe_ingredients", { id: "r1:0", recipe_id: "r1", position: 0, item: "lentils", optional: 0 });
    await store.put("recipe_steps", { id: "r1:1", recipe_id: "r1", position: 1, text: "Simmer" });
    await store.put("recipe_steps", { id: "r1:0", recipe_id: "r1", position: 0, text: "Rinse" });
  });

  it("ingredients and steps come back in position order", async () => {
    const view = await recipeView(store, "r1");
    expect(view?.ingredients.map((i) => i.item)).toEqual(["lentils", "cumin"]);
    expect(view?.steps.map((s) => s.text)).toEqual(["Rinse", "Simmer"]);
  });

  it("an optional ingredient stored as 1 is optional, not required", async () => {
    // SQLite has no boolean. Anything comparing this to `true` reads every optional
    // ingredient as required, which is a recipe telling a cook to buy what they need not.
    const view = await recipeView(store, "r1");
    expect(view?.ingredients.find((i) => i.item === "cumin")?.optional).toBe(true);
    expect(view?.ingredients.find((i) => i.item === "lentils")?.optional).toBe(false);
  });

  it("a queued edit is what you see, not the server's copy", async () => {
    await enqueue(store, intent());
    const view = await recipeView(store, "r1");
    expect(view?.title).toBe("Dal, the way I make it");
    expect(view?.cook_minutes).toBe(40);
    expect(view?.visibility).toBe("private");
    expect(view?.ingredients.map((i) => i.item)).toEqual(["cumin"]);
    expect(view?.steps.map((s) => s.text)).toEqual(["Rinse twice"]);
    expect(view?.showingLocalEdit).toBe(true);
  });

  it("without a queued edit, nothing claims to be showing one", async () => {
    expect((await recipeView(store, "r1"))?.showingLocalEdit).toBe(false);
  });

  it("the newest queued write is the one shown", async () => {
    await enqueue(store, intent({ id: "old", createdAt: "2026-11-02T09:00:00.000Z" }));
    await enqueue(
      store,
      intent({
        id: "new",
        createdAt: "2026-11-02T11:00:00.000Z",
        payload: { ...intent().payload, title: "Newest" },
      }),
    );
    expect((await recipeView(store, "r1"))?.title).toBe("Newest");
  });

  it("a recipe created offline reads from its own queued create", async () => {
    await store.put("recipes", { id: "local:abc", title: "Anar" });
    await enqueue(
      store,
      intent({
        id: "create",
        kind: "create",
        recipeId: "local:abc",
        baseUpdatedAt: null,
        payload: { ...intent().payload, title: "Anar, as typed" },
      }),
    );
    const view = await recipeView(store, "local:abc");
    expect(view?.title).toBe("Anar, as typed");
    expect(view?.steps.map((s) => s.text)).toEqual(["Rinse twice"]);
  });

  it("another recipe's children are not in this one", async () => {
    await store.put("recipes", { id: "r2", title: "Khichdi" });
    await store.put("recipe_ingredients", { id: "r2:0", recipe_id: "r2", position: 0, item: "rice" });
    expect((await recipeView(store, "r1"))?.ingredients.map((i) => i.item)).toEqual(["lentils", "cumin"]);
    expect((await recipeView(store, "r2"))?.ingredients.map((i) => i.item)).toEqual(["rice"]);
  });

  it("an unknown id is null rather than a throw", async () => {
    expect(await recipeView(store, "nobody")).toBeNull();
  });
});
