import { describe, it, expect, beforeEach } from "vitest";
import type { Store } from "./store/types";
import { createMemoryStore } from "./store/memory";
import { enqueue, localRecipeId, markConflicted, markFailed } from "./sync/outbox";
import type { Intent } from "./sync/outbox";
import { shelfRows } from "./shelf";

const intent = (overrides: Partial<Intent> = {}): Intent => ({
  id: "intent-1",
  kind: "edit",
  recipeId: "r1",
  baseUpdatedAt: "2026-11-01T09:00:00.000Z",
  payload: { family_id: "family-1", title: "Dal", prep_minutes: null, cook_minutes: null, visibility: "family", ingredients: [], steps: [] },
  createdAt: "2026-11-02T10:00:00.000Z",
  state: "queued",
  error: null,
  ...overrides,
});

describe("shelfRows", () => {
  let store: Store;
  beforeEach(async () => {
    store = createMemoryStore();
    await store.put("recipes", { id: "r1", title: "Dal", prep_minutes: 10, cook_minutes: 20 });
  });

  it("a recipe with nothing queued is synced", async () => {
    const [row] = await shelfRows(store);
    expect(row).toMatchObject({ id: "r1", title: "Dal", minutes: 30, sync: "synced", byline: null });
  });

  it("a recipe with a queued edit reports queued", async () => {
    await enqueue(store, intent());
    expect((await shelfRows(store))[0].sync).toBe("queued");
  });

  it("a recipe whose replay failed reports failed", async () => {
    await enqueue(store, intent());
    await markFailed(store, "intent-1", "offline");
    expect((await shelfRows(store))[0].sync).toBe("failed");
  });

  it("a recipe in conflict reports conflicted, and names the intent to open", async () => {
    await enqueue(store, intent());
    await markConflicted(store, "intent-1");
    const [row] = await shelfRows(store);
    expect(row.sync).toBe("conflicted");
    expect(row.intentId).toBe("intent-1");
  });

  it("only a conflict carries an intent to open", async () => {
    // Carrying it for every row would invite a screen to open a settled intent.
    await enqueue(store, intent());
    expect((await shelfRows(store))[0].intentId).toBeNull();
    await markFailed(store, "intent-1", "offline");
    expect((await shelfRows(store))[0].intentId).toBeNull();
  });

  it("the state that needs a person wins over the one that needs the network", async () => {
    await enqueue(store, intent({ id: "a" }));
    await enqueue(store, intent({ id: "b" }));
    await markConflicted(store, "b");
    // "queued" about work that is really waiting on a decision is a row nobody ever taps.
    expect((await shelfRows(store))[0].sync).toBe("conflicted");
  });

  it("rows are ordered by title, ignoring case", async () => {
    await store.put("recipes", { id: "r2", title: "aloo gobi" });
    await store.put("recipes", { id: "r3", title: "Biryani" });
    expect((await shelfRows(store)).map((row) => row.title)).toEqual(["aloo gobi", "Biryani", "Dal"]);
  });

  it("a recipe created offline is on the shelf before it has a server id", async () => {
    const localId = localRecipeId();
    await store.put("recipes", { id: localId, title: "Anar" });
    const rows = await shelfRows(store);
    // No outbox row at all yet: written to the store first, queued second. It must still
    // appear, because a cook who typed a recipe on a train has to be able to see it.
    expect(rows[0]).toMatchObject({ id: localId, title: "Anar", sync: "queued" });
  });

  it("a recipe saved from Potluck carries its original cook's byline", async () => {
    await store.put("recipes", {
      id: "r4",
      title: "Anar",
      source_recipe_id: "elsewhere",
      source_cook_name: "Asha",
    });
    // Offline too: the byline is on the recipe row, so nothing here needs the network to
    // know whose dish it was.
    expect((await shelfRows(store))[0]).toMatchObject({ title: "Anar", byline: "Asha" });
  });

  it("minutes are the two numbers together, and null when there are none", async () => {
    await store.put("recipes", { id: "r5", title: "Anar", prep_minutes: 5, cook_minutes: null });
    await store.put("recipes", { id: "r6", title: "Baingan", prep_minutes: null, cook_minutes: null });
    const rows = await shelfRows(store);
    expect(rows.find((row) => row.id === "r5")?.minutes).toBe(5);
    expect(rows.find((row) => row.id === "r6")?.minutes).toBeNull();
  });

  it("an empty shelf is an empty list, not a throw", async () => {
    expect(await shelfRows(createMemoryStore())).toEqual([]);
  });
});
