import { describe, it, expect } from "vitest";
import type { Recipe } from "../../lib/api/types";
import type { Intent } from "./outbox";
import type { ServerRecipe } from "./conflict";
import { hasMoved, describeConflict } from "./conflict";

const intent = (overrides: Partial<Intent> = {}): Intent => ({
  id: "intent-1",
  kind: "edit",
  recipeId: "recipe-1",
  baseUpdatedAt: "2026-11-01T09:00:00.000Z",
  payload: {
    family_id: "family-1",
    title: "My dal",
    prep_minutes: 10,
    cook_minutes: 20,
    visibility: "family",
    ingredients: [{ position: 0, quantity: "200", unit: "g", item: "lentils" }],
    steps: [{ position: 0, text: "Rinse" }],
  },
  createdAt: "2026-11-02T10:00:00.000Z",
  state: "queued",
  error: null,
  ...overrides,
});

const server = (overrides: Partial<Recipe> = {}): ServerRecipe => ({
  recipe: {
    id: "recipe-1",
    family_id: "family-1",
    author_id: "cook-2",
    title: "Her dal",
    story: null,
    provenance: null,
    servings: 4,
    prep_minutes: 15,
    cook_minutes: 25,
    visibility: "public",
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
  ingredients: [{ position: 0, quantity: "250", unit: "g", item: "lentils" }],
  steps: [{ position: 0, text: "Rinse twice" }],
  authorName: "Asha",
});

describe("conflict", () => {
  it("a recipe at the timestamp the edit was based on has not moved", () => {
    expect(hasMoved(intent(), "2026-11-01T09:00:00.000Z")).toBe(false);
  });

  it("a different timestamp has moved", () => {
    expect(hasMoved(intent(), "2026-11-02T08:00:00.000Z")).toBe(true);
  });

  it("an equivalent instant written differently still counts as moved", () => {
    // Deliberate: the comparison is identity of the revision, not ordering of instants. A
    // string the server did not return is not the revision this edit was based on, and
    // parsing to Date to call them equal is the timezone class 0067 already cost this repo.
    expect(hasMoved(intent(), "2026-11-01T09:00:00Z")).toBe(true);
  });

  it("a create never conflicts, because there is nothing to have moved", () => {
    const create = intent({ kind: "create", baseUpdatedAt: null });
    expect(hasMoved(create, "2026-11-02T08:00:00.000Z")).toBe(false);
  });

  it("describeConflict keeps the cook's own version as mine and names whose the other is", () => {
    const mine = intent();
    const conflict = describeConflict(mine, server({ updated_at: "2026-11-02T08:00:00.000Z" }));

    expect(conflict.intentId).toBe("intent-1");
    expect(conflict.mine).toBe(mine.payload);
    expect(conflict.mine.title).toBe("My dal");
    expect(conflict.theirs.title).toBe("Her dal");
    expect(conflict.theirs.prep_minutes).toBe(15);
    expect(conflict.theirs.visibility).toBe("public");
    expect(conflict.theirs.ingredients[0].quantity).toBe("250");
    expect(conflict.theirs.steps[0].text).toBe("Rinse twice");
    expect(conflict.theirsAuthor).toBe("Asha");
    expect(conflict.theirsUpdatedAt).toBe("2026-11-02T08:00:00.000Z");
  });

  it("an unknown author is null rather than a placeholder name", () => {
    const conflict = describeConflict(intent(), { ...server(), authorName: null });
    expect(conflict.theirsAuthor).toBeNull();
  });
});
