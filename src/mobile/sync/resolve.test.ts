import { describe, it, expect, beforeEach } from "vitest";
import type { Recipe } from "../../lib/api/types";
import type { Store } from "../store/types";
import { createMemoryStore } from "../store/memory";
import type { Intent } from "./outbox";
import { enqueue, markConflicted, pending } from "./outbox";
import type { ServerRecipe } from "./conflict";
import type { Remote } from "./replay";
import { REFUSED, resolveConflict } from "./replay";

const BASE = "2026-11-01T09:00:00.000Z";

const intent = (overrides: Partial<Intent> = {}): Intent => ({
  id: "intent-1",
  kind: "edit",
  recipeId: "r1",
  baseUpdatedAt: BASE,
  payload: {
    family_id: "family-1",
    title: "Mine",
    prep_minutes: 10,
    cook_minutes: 20,
    visibility: "family",
    ingredients: [],
    steps: [],
  },
  createdAt: "2026-11-02T10:00:00.000Z",
  state: "conflicted",
  error: null,
  ...overrides,
});

const server: ServerRecipe = {
  recipe: {
    id: "r1",
    family_id: "family-1",
    author_id: "cook-2",
    title: "Theirs",
    story: null,
    provenance: null,
    servings: 4,
    prep_minutes: 15,
    cook_minutes: 25,
    visibility: "family",
    source_url: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-11-02T08:00:00.000Z",
    source_recipe_id: null,
    source_cook_name: null,
    adapted_at: null,
    removed_at: null,
    removed_reason: null,
  } satisfies Recipe,
  ingredients: [],
  steps: [],
  authorName: "Asha",
};

const fakeRemote = (overrides: Partial<Remote> = {}): Remote & { forced: boolean[]; creates: number } => {
  const forced: boolean[] = [];
  const counts = { creates: 0 };
  return {
    forced,
    get creates() {
      return counts.creates;
    },
    getRecipe: async () => ({ row: server, error: null }),
    createRecipe: async () => {
      counts.creates += 1;
      return { row: { id: "server-1" }, error: null };
    },
    publishEdit: async (_sending, force) => {
      forced.push(force);
      return { row: { id: "r1" }, error: null };
    },
    ...overrides,
  };
};

describe("resolveConflict", () => {
  let store: Store;
  beforeEach(async () => {
    store = createMemoryStore();
    await store.put("recipes", { id: "r1", title: "Theirs", updated_at: server.recipe.updated_at });
    await enqueue(store, intent());
    await markConflicted(store, "intent-1");
  });

  it("keeping mine republishes with force and ends sent", async () => {
    const remote = fakeRemote();
    expect(await resolveConflict(store, remote, "intent-1", "mine")).toBe("sent");
    // force is the point: the recipe HAS moved, so an unforced publish would be refused
    // again and the cook's choice would do nothing.
    expect(remote.forced).toEqual([true]);
    expect(await store.get("outbox", "intent-1")).toBeNull();
  });

  it("keeping theirs drops the intent and leaves the server untouched", async () => {
    const remote = fakeRemote();
    expect(await resolveConflict(store, remote, "intent-1", "theirs")).toBe("dropped");
    expect(remote.forced).toEqual([]);
    expect(await store.get("outbox", "intent-1")).toBeNull();
  });

  it("a resolution the database refuses is failed, and the work is still here", async () => {
    // force was true, so this is not staleness: it is a policy saying this cook may not
    // write this recipe. Telling them their choice was taken when nothing was written is
    // the one outcome that must not happen.
    const remote = fakeRemote({ publishEdit: async () => ({ row: null, error: null }) });
    expect(await resolveConflict(store, remote, "intent-1", "mine")).toBe("failed");
    const [still] = await pending(store);
    expect(still.id).toBe("intent-1");
    expect(still.error).toBe(REFUSED);
  });

  it("a transport error keeps the cook's version and says why", async () => {
    const remote = fakeRemote({
      publishEdit: async () => ({ row: null, error: "Network request failed" }),
    });
    expect(await resolveConflict(store, remote, "intent-1", "mine")).toBe("failed");
    expect((await pending(store))[0].error).toBe("Network request failed");
  });

  it("resolving something that is not there is failed, not a throw", async () => {
    expect(await resolveConflict(store, fakeRemote(), "nobody", "mine")).toBe("failed");
  });

  it("keeping mine on a create sends it as a create", async () => {
    await store.put("recipes", { id: "local:abc", title: "Mine" });
    await enqueue(store, intent({ id: "create-1", kind: "create", recipeId: "local:abc", baseUpdatedAt: null }));
    await markConflicted(store, "create-1");
    const remote = fakeRemote();
    expect(await resolveConflict(store, remote, "create-1", "mine")).toBe("sent");
    // WHICH call, not just the outcome. Forcing a create through publishEdit writes a draft
    // targeting a `local:` id the server has never heard of, and a fake that only reports
    // the outcome accepts it happily. The first version of this test did exactly that.
    expect(remote.creates).toBe(1);
    expect(remote.forced).toEqual([]);
  });
});
