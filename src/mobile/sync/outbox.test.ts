import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStore } from "../store/memory";
import type { Store } from "../store/types";
import type { Intent } from "./outbox";
import {
  localRecipeId,
  enqueue,
  pending,
  markSent,
  markFailed,
  markConflicted,
} from "./outbox";

let n = 0;
const intent = (overrides: Partial<Intent> = {}): Intent => ({
  id: `intent-${++n}`,
  kind: "create",
  recipeId: localRecipeId(),
  baseUpdatedAt: null,
  payload: {
    title: "Dal",
    prep_minutes: 10,
    cook_minutes: 20,
    visibility: "family",
    ingredients: [],
    steps: [],
  },
  createdAt: "2026-11-02T10:00:00.000Z",
  state: "queued",
  error: null,
  ...overrides,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("outbox", () => {
  let store: Store;
  beforeEach(() => {
    store = createMemoryStore();
  });

  it("a queued create carries a local id that is not a uuid", () => {
    const first = localRecipeId();
    const second = localRecipeId();
    expect(first.startsWith("local:")).toBe(true);
    expect(first).not.toMatch(UUID);
    expect(first).not.toEqual(second);
  });

  it("pending returns intents oldest first", async () => {
    await enqueue(store, intent({ id: "b", createdAt: "2026-11-02T11:00:00.000Z" }));
    await enqueue(store, intent({ id: "c", createdAt: "2026-11-02T12:00:00.000Z" }));
    await enqueue(store, intent({ id: "a", createdAt: "2026-11-02T10:00:00.000Z" }));
    expect((await pending(store)).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("a conflicted intent is not pending", async () => {
    const queued = intent();
    await enqueue(store, queued);
    await markConflicted(store, queued.id);
    expect(await pending(store)).toEqual([]);
  });

  it("a failed intent keeps its message and stays pending", async () => {
    const queued = intent();
    await enqueue(store, queued);
    await markFailed(store, queued.id, "network unreachable");
    const [after] = await pending(store);
    expect(after.state).toBe("failed");
    expect(after.error).toBe("network unreachable");
  });

  it("markSent rewrites the local id to the server's everywhere it appears", async () => {
    const localId = localRecipeId();
    const serverId = "11111111-2222-3333-4444-555555555555";

    await store.put("recipes", { id: localId, title: "Dal" });
    await store.put("recipe_ingredients", { id: `${localId}:0`, recipe_id: localId, position: 0, item: "lentils" });
    await store.put("recipe_ingredients", { id: `${localId}:1`, recipe_id: localId, position: 1, item: "cumin" });
    await store.put("recipe_steps", { id: `${localId}:0`, recipe_id: localId, position: 0, text: "Rinse" });
    await store.put("saves", { id: "save-1", recipe_id: localId });
    await store.put("meal_plan_items", { id: "item-1", recipe_id: localId });

    const create = intent({ id: "create-1", recipeId: localId });
    const laterEdit = intent({ id: "edit-1", kind: "edit", recipeId: localId, createdAt: "2026-11-02T13:00:00.000Z" });
    await enqueue(store, create);
    await enqueue(store, laterEdit);

    await markSent(store, create.id, serverId);

    expect(await store.get("recipes", serverId)).toMatchObject({ id: serverId, title: "Dal" });
    expect(await store.get("recipes", localId)).toBeNull();

    const ingredients = await store.all("recipe_ingredients");
    expect(ingredients).toHaveLength(2);
    expect(ingredients.map((row) => row.id).sort()).toEqual([`${serverId}:0`, `${serverId}:1`]);
    expect(ingredients.every((row) => row.recipe_id === serverId)).toBe(true);

    const steps = await store.all("recipe_steps");
    expect(steps).toHaveLength(1);
    expect(steps[0].id).toBe(`${serverId}:0`);

    expect((await store.get("saves", "save-1"))?.recipe_id).toBe(serverId);
    expect((await store.get("meal_plan_items", "item-1"))?.recipe_id).toBe(serverId);

    const queued = await pending(store);
    expect(queued).toHaveLength(1);
    expect(queued[0].id).toBe("edit-1");
    expect(queued[0].recipeId).toBe(serverId);
  });

  it("a create replayed after markSent is not sent again", async () => {
    const create = intent();
    await enqueue(store, create);
    await markSent(store, create.id, "server-1");
    expect(await pending(store)).toEqual([]);
    // The second call is the crash case: the device died believing it had not acknowledged.
    await markSent(store, create.id, "server-1");
    expect(await pending(store)).toEqual([]);
  });

  it("an edit's id is left alone by markSent", async () => {
    const serverId = "11111111-2222-3333-4444-555555555555";
    await store.put("recipes", { id: serverId, title: "Dal" });
    await store.put("recipe_ingredients", { id: `${serverId}:0`, recipe_id: serverId, position: 0, item: "lentils" });

    const edit = intent({ kind: "edit", recipeId: serverId, baseUpdatedAt: "2026-11-01T00:00:00.000Z" });
    await enqueue(store, edit);
    await markSent(store, edit.id, serverId);

    expect(await store.get("recipes", serverId)).toMatchObject({ id: serverId });
    const ingredients = await store.all("recipe_ingredients");
    expect(ingredients).toHaveLength(1);
    expect(ingredients[0].id).toBe(`${serverId}:0`);
    expect(await pending(store)).toEqual([]);
  });

  it("marking an unknown intent changes nothing", async () => {
    await markSent(store, "nobody", "server-1");
    await markFailed(store, "nobody", "boom");
    await markConflicted(store, "nobody");
    expect(await pending(store)).toEqual([]);
    expect(await store.all("outbox")).toEqual([]);
  });
});
