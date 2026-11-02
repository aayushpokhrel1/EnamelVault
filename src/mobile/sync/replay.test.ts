import { describe, it, expect, beforeEach } from "vitest";
import type { Recipe } from "../../lib/api/types";
import type { Store } from "../store/types";
import { createMemoryStore } from "../store/memory";
import type { Intent } from "./outbox";
import { enqueue, pending } from "./outbox";
import type { ServerRecipe } from "./conflict";
import type { Remote, RemoteResult } from "./replay";
import { replayAll, replayOne, REFUSED, GONE } from "./replay";

const BASE = "2026-11-01T09:00:00.000Z";

const intent = (overrides: Partial<Intent> = {}): Intent => ({
  id: "intent-1",
  kind: "edit",
  recipeId: "recipe-1",
  baseUpdatedAt: BASE,
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

const serverRecipe = (updatedAt: string): ServerRecipe => ({
  recipe: {
    id: "recipe-1",
    family_id: "family-1",
    author_id: "cook-1",
    title: "Dal",
    story: null,
    provenance: null,
    servings: 4,
    prep_minutes: 10,
    cook_minutes: 20,
    visibility: "family",
    source_url: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: updatedAt,
    source_recipe_id: null,
    source_cook_name: null,
    adapted_at: null,
    removed_at: null,
    removed_reason: null,
  } satisfies Recipe,
  ingredients: [],
  steps: [],
  authorName: "Asha",
});

const ok = <T,>(row: T): RemoteResult<T> => ({ row, error: null });
/** What RLS actually does: zero rows affected, and NO error. */
const refused = <T,>(): RemoteResult<T> => ({ row: null, error: null });

type Calls = { publishEdit: number; createRecipe: number };

const fakeRemote = (overrides: Partial<Remote> = {}): Remote & { calls: Calls } => {
  const calls: Calls = { publishEdit: 0, createRecipe: 0 };
  return {
    calls,
    getRecipe: async () => ok(serverRecipe(BASE)),
    createRecipe: async () => {
      calls.createRecipe += 1;
      return ok({ id: "server-1" });
    },
    publishEdit: async () => {
      calls.publishEdit += 1;
      return ok({ id: "recipe-1" });
    },
    ...overrides,
  };
};

describe("replay", () => {
  let store: Store;
  beforeEach(() => {
    store = createMemoryStore();
  });

  it("an edit the database refuses affects zero rows and is reported as failed", async () => {
    const edit = intent();
    await enqueue(store, edit);
    const outcome = await replayOne(store, fakeRemote({ publishEdit: async () => refused() }), edit);

    expect(outcome).toBe("failed");
    const [still] = await pending(store);
    expect(still.id).toBe("intent-1");
    expect(still.state).toBe("failed");
    expect(still.error).toBe(REFUSED);
  });

  it("a create the database refuses is failed, not sent", async () => {
    const create = intent({ kind: "create", recipeId: "local:abc", baseUpdatedAt: null });
    await enqueue(store, create);
    const outcome = await replayOne(store, fakeRemote({ createRecipe: async () => refused() }), create);

    expect(outcome).toBe("failed");
    expect((await pending(store))[0].error).toBe(REFUSED);
  });

  it("an edit whose recipe was deleted on the server is failed with a reason", async () => {
    const edit = intent();
    await enqueue(store, edit);
    const remote = fakeRemote({ getRecipe: async () => refused() });
    const outcome = await replayOne(store, remote, edit);

    expect(outcome).toBe("failed");
    expect((await pending(store))[0].error).toBe(GONE);
    // It must not then be published into nothing.
    expect(remote.calls.publishEdit).toBe(0);
  });

  it("an edit whose recipe moved is conflicted, not sent", async () => {
    const edit = intent();
    await enqueue(store, edit);
    const remote = fakeRemote({ getRecipe: async () => ok(serverRecipe("2026-11-02T08:00:00.000Z")) });
    const outcome = await replayOne(store, remote, edit);

    expect(outcome).toBe("conflicted");
    expect(remote.calls.publishEdit).toBe(0);
    // Conflicted is not pending: it waits on the cook, not on the network.
    expect(await pending(store)).toEqual([]);
    expect((await store.get("outbox", "intent-1"))?.state).toBe("conflicted");
  });

  it("a transport error keeps the message the screen will show", async () => {
    const edit = intent();
    await enqueue(store, edit);
    const outcome = await replayOne(
      store,
      fakeRemote({ publishEdit: async () => ({ row: null, error: "Network request failed" }) }),
      edit,
    );

    expect(outcome).toBe("failed");
    expect((await pending(store))[0].error).toBe("Network request failed");
  });

  it("a successful edit marks the intent sent exactly once", async () => {
    const edit = intent();
    await enqueue(store, edit);
    const remote = fakeRemote();

    expect(await replayOne(store, remote, edit)).toBe("sent");
    expect(await pending(store)).toEqual([]);
    expect(await replayAll(store, remote)).toEqual({ sent: 0, conflicted: 0, failed: 0 });
    expect(remote.calls.publishEdit).toBe(1);
  });

  it("one failure does not stop the rest of the queue", async () => {
    await enqueue(store, intent({ id: "a", createdAt: "2026-11-02T10:00:00.000Z" }));
    await enqueue(store, intent({ id: "b", recipeId: "recipe-2", createdAt: "2026-11-02T11:00:00.000Z" }));
    await enqueue(store, intent({ id: "c", createdAt: "2026-11-02T12:00:00.000Z" }));

    const remote = fakeRemote({
      getRecipe: async (id) => (id === "recipe-2" ? refused() : ok(serverRecipe(BASE))),
    });
    expect(await replayAll(store, remote)).toEqual({ sent: 2, conflicted: 0, failed: 1 });
    expect((await pending(store)).map((i) => i.id)).toEqual(["b"]);
  });

  it("an edit queued after a create is replayed against the server's id, not the local one", async () => {
    const localId = "local:abc";
    await store.put("recipes", { id: localId, title: "Dal" });
    await enqueue(store, intent({ id: "create", kind: "create", recipeId: localId, baseUpdatedAt: null }));
    await enqueue(store, intent({ id: "later-edit", recipeId: localId, createdAt: "2026-11-02T11:00:00.000Z" }));

    const seen: string[] = [];
    const remote = fakeRemote({
      getRecipe: async (id) => {
        seen.push(id);
        return ok(serverRecipe(BASE));
      },
      publishEdit: async (id) => ok({ id }),
    });

    expect(await replayAll(store, remote)).toEqual({ sent: 2, conflicted: 0, failed: 0 });
    // The whole point: the second pass saw the server's id, because markSent rewrote it.
    expect(seen).toEqual(["server-1"]);
    expect(await store.get("recipes", "server-1")).not.toBeNull();
  });
});
