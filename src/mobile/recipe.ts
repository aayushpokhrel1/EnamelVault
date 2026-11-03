import type { Ingredient, Step, Visibility } from "../lib/api/types";
import type { Row, Store } from "./store/types";
import type { DraftPayload } from "./sync/outbox";
import { enqueue, localRecipeId } from "./sync/outbox";

export type RecipeView = {
  id: string;
  title: string;
  story: string | null;
  provenance: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  visibility: Visibility;
  byline: string | null;
  ingredients: Ingredient[];
  steps: Step[];
  /** True while an unsent edit is what is being shown, so the screen can say so. */
  showingLocalEdit: boolean;
};

const text = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);
const number = (value: unknown): number | null => (typeof value === "number" ? value : null);
const position = (row: Row): number => (typeof row.position === "number" ? row.position : 0);

const byPosition = (rows: Row[], recipeId: string): Row[] =>
  rows.filter((row) => row.recipe_id === recipeId).sort((a, b) => position(a) - position(b));

const toIngredient = (row: Row): Ingredient => ({
  position: position(row),
  quantity: text(row.quantity),
  unit: text(row.unit),
  item: String(row.item ?? ""),
  section: text(row.section),
  // SQLite has no boolean, so `optional` comes back as 0 or 1 and anything comparing it to
  // true would read every optional ingredient as required.
  optional: row.optional === 1 || row.optional === true,
  alt_group: text(row.alt_group),
});

const toStep = (row: Row): Step => ({ position: position(row), text: String(row.text ?? "") });

// An intent's own id. It only has to be unique on this device: the server never sees it.
const intentId = (): string => `intent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * The queued write that owns this recipe, if there is one. There is at most one per recipe
 * by construction (a second edit replaces the first), and a create counts: a recipe made
 * offline exists ONLY as its intent's payload plus the row written beside it.
 */
async function queuedPayload(store: Store, recipeId: string): Promise<DraftPayload | null> {
  const mine = (await store.all<Row>("outbox")).filter((row) => row.recipe_id === recipeId);
  if (mine.length === 0) return null;
  const latest = mine.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).at(-1);
  return (latest?.payload as DraftPayload | undefined) ?? null;
}

/**
 * What the cook sees. The QUEUED EDIT WINS over the stored row, because the alternative is
 * showing somebody their own change undone: they typed it, the phone has it, and the only
 * thing missing is a network the app has promised not to need.
 */
export async function recipeView(store: Store, id: string): Promise<RecipeView | null> {
  const row = await store.get<Row>("recipes", id);
  // Null rather than a throw: an id that is not here is an ordinary state on a device that
  // syncs, not an error, and a screen can say "not on this phone" far better than a crash.
  if (!row) return null;

  const payload = await queuedPayload(store, id);
  const stored = {
    ingredients: byPosition(await store.all<Row>("recipe_ingredients"), id).map(toIngredient),
    steps: byPosition(await store.all<Row>("recipe_steps"), id).map(toStep),
  };

  return {
    id,
    title: payload ? payload.title : String(row.title ?? ""),
    story: text(row.story),
    provenance: text(row.provenance),
    servings: number(row.servings),
    prep_minutes: payload ? payload.prep_minutes : number(row.prep_minutes),
    cook_minutes: payload ? payload.cook_minutes : number(row.cook_minutes),
    visibility: payload ? payload.visibility : ((text(row.visibility) ?? "family") as Visibility),
    byline: text(row.source_cook_name),
    ingredients: payload
      ? [...payload.ingredients].sort((a, b) => a.position - b.position)
      : stored.ingredients,
    steps: payload ? [...payload.steps].sort((a, b) => a.position - b.position) : stored.steps,
    showingLocalEdit: payload !== null,
  };
}

/**
 * Queue an edit. The intent carries the recipe's `updated_at` AS THE DEVICE LAST SAW IT, not
 * the time of the edit: that is the revision the cook was looking at while they typed, and
 * it is what both the client check and the RPC compare against.
 *
 * A second edit REPLACES the first rather than queueing beside it. Two intents for one
 * recipe would replay in order, the first landing and moving `updated_at`, the second then
 * refusing as stale against a change the same cook had just made.
 */
export async function queueEdit(store: Store, id: string, payload: DraftPayload): Promise<void> {
  const row = await store.get<Row>("recipes", id);
  if (!row) throw new Error("That recipe is not on this phone.");

  const existing = (await store.all<Row>("outbox")).find((intent) => intent.recipe_id === id);
  if (existing) {
    // The base stays the ORIGINAL one. The server has not moved as far as this device knows,
    // so the revision this edit is against is still the one the first edit was against;
    // replacing it with anything newer would be inventing knowledge of the server.
    //
    // And a CREATE stays a create. Turning it into an edit would send a create the server
    // never received, then an edit against an id it has never heard of.
    await store.put("outbox", {
      ...existing,
      payload,
      state: "queued",
      error: null,
    });
    return;
  }

  await enqueue(store, {
    id: intentId(),
    kind: "edit",
    recipeId: id,
    baseUpdatedAt: text(row.updated_at),
    payload,
    createdAt: new Date().toISOString(),
    state: "queued",
    error: null,
  });
}

/**
 * Queue a create, and write the recipe row at the same time so it is on the shelf before it
 * has ever been sent. Returns the local id.
 *
 * The row is written FIRST and in the same transaction as the intent: a row with no intent is
 * a recipe that never sends, and an intent with no row is a recipe the cook cannot see.
 */
export async function queueCreate(store: Store, payload: DraftPayload): Promise<string> {
  const id = localRecipeId();
  await store.transaction(async (tx) => {
    await tx.put("recipes", {
      id,
      family_id: payload.family_id,
      title: payload.title,
      prep_minutes: payload.prep_minutes,
      cook_minutes: payload.cook_minutes,
      visibility: payload.visibility,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    for (const ingredient of payload.ingredients) {
      await tx.put("recipe_ingredients", {
        ...ingredient,
        id: `${id}:${ingredient.position}`,
        recipe_id: id,
        optional: ingredient.optional ? 1 : 0,
      });
    }
    for (const step of payload.steps) {
      await tx.put("recipe_steps", { ...step, id: `${id}:${step.position}`, recipe_id: id });
    }
    await enqueue(tx, {
      id: intentId(),
      kind: "create",
      recipeId: id,
      // Nothing on the server to be stale against. hasMoved reads this as "never conflicts".
      baseUpdatedAt: null,
      payload,
      createdAt: new Date().toISOString(),
      state: "queued",
      error: null,
    });
  });
  return id;
}
