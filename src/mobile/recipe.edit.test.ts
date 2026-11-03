import { describe, it, expect, beforeEach } from "vitest";
import type { Row, Store } from "./store/types";
import { createMemoryStore } from "./store/memory";
import type { DraftPayload } from "./sync/outbox";
import { isLocalRecipeId, pending } from "./sync/outbox";
import { queueCreate, queueEdit, recipeView } from "./recipe";
import { shelfRows } from "./shelf";

const BASE = "2026-11-01T09:00:00.000Z";

const payload = (overrides: Partial<DraftPayload> = {}): DraftPayload => ({
  family_id: "family-1",
  title: "Dal",
  prep_minutes: 10,
  cook_minutes: 20,
  visibility: "family",
  ingredients: [{ position: 0, quantity: "200", unit: "g", item: "lentils" }],
  steps: [{ position: 0, text: "Rinse" }],
  ...overrides,
});

describe("queueEdit", () => {
  let store: Store;
  beforeEach(async () => {
    store = createMemoryStore();
    await store.put("recipes", { id: "r1", title: "Dal", updated_at: BASE, family_id: "family-1" });
  });

  it("queues one intent carrying the recipe's updated_at as the base", async () => {
    await queueEdit(store, "r1", payload({ title: "Dal, better" }));
    const queued = await pending(store);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ kind: "edit", recipeId: "r1", baseUpdatedAt: BASE });
    expect(queued[0].payload.title).toBe("Dal, better");
  });

  it("a second edit replaces the first rather than queueing two", async () => {
    await queueEdit(store, "r1", payload({ title: "First" }));
    await queueEdit(store, "r1", payload({ title: "Second" }));
    const queued = await pending(store);
    // Two intents for one recipe replay in order: the first lands and moves updated_at, and
    // the second then refuses as stale against a change the same cook just made.
    expect(queued).toHaveLength(1);
    expect(queued[0].payload.title).toBe("Second");
  });

  it("the replacement keeps the ORIGINAL base, not a newer one", async () => {
    await queueEdit(store, "r1", payload({ title: "First" }));
    // The server has not moved as far as this device knows, so the revision the second edit
    // is against is still the one the first was against. Anything newer would be inventing
    // knowledge of the server.
    await store.put("recipes", { id: "r1", title: "Dal", updated_at: "2026-11-02T00:00:00.000Z" });
    await queueEdit(store, "r1", payload({ title: "Second" }));
    expect((await pending(store))[0].baseUpdatedAt).toBe(BASE);
  });

  it("an edit on top of a queued create stays a create", async () => {
    const id = await queueCreate(store, payload({ title: "New" }));
    await queueEdit(store, id, payload({ title: "New, renamed" }));
    const queued = await pending(store);
    // Turning it into an edit would send a create the server never received, then an edit
    // against an id it has never heard of.
    expect(queued).toHaveLength(1);
    expect(queued[0].kind).toBe("create");
    expect(queued[0].baseUpdatedAt).toBeNull();
    expect(queued[0].payload.title).toBe("New, renamed");
  });

  it("editing after a failure puts it back in the queue with no stale message", async () => {
    await queueEdit(store, "r1", payload({ title: "First" }));
    const [first] = await pending(store);
    await store.put("outbox", {
      ...((await store.get<Row>("outbox", first.id)) as Row),
      state: "failed",
      error: "offline",
    });
    await queueEdit(store, "r1", payload({ title: "Second" }));
    const [after] = await pending(store);
    expect(after.state).toBe("queued");
    expect(after.error).toBeNull();
  });

  it("editing a recipe that is not on this phone is refused", async () => {
    await expect(queueEdit(store, "nobody", payload())).rejects.toThrow();
  });
});

describe("queueCreate", () => {
  let store: Store;
  beforeEach(() => {
    store = createMemoryStore();
  });

  it("queues an intent with a local id and a null base", async () => {
    const id = await queueCreate(store, payload({ title: "Anar" }));
    expect(isLocalRecipeId(id)).toBe(true);
    const queued = await pending(store);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ kind: "create", recipeId: id, baseUpdatedAt: null });
  });

  it("the recipe is on the shelf immediately, before it has ever been sent", async () => {
    const id = await queueCreate(store, payload({ title: "Anar" }));
    const rows = await shelfRows(store);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, title: "Anar", sync: "queued" });
  });

  it("the recipe opens, with its ingredients and steps", async () => {
    const id = await queueCreate(store, payload({ title: "Anar" }));
    const view = await recipeView(store, id);
    expect(view?.title).toBe("Anar");
    expect(view?.ingredients.map((i) => i.item)).toEqual(["lentils"]);
    expect(view?.steps.map((s) => s.text)).toEqual(["Rinse"]);
  });

  it("the row and the intent are written together or not at all", async () => {
    const id = await queueCreate(store, payload());
    // A row with no intent is a recipe that never sends; an intent with no row is a recipe
    // the cook cannot see. One transaction, so neither can happen.
    expect(await store.get("recipes", id)).not.toBeNull();
    expect((await pending(store))[0].recipeId).toBe(id);
  });

  it("an optional ingredient survives the round trip as optional", async () => {
    const id = await queueCreate(
      store,
      payload({ ingredients: [{ position: 0, quantity: null, unit: null, item: "chilli", optional: true }] }),
    );
    // The STORED row, not the view: recipeView reads the queued payload on top, where
    // `optional` is still a real boolean, so asserting through it would prove nothing about
    // what was written. SQLite has no boolean, so the row must hold 1.
    expect((await store.get("recipe_ingredients", `${id}:0`))?.optional).toBe(1);
    expect((await recipeView(store, id))?.ingredients[0].optional).toBe(true);
  });
});
