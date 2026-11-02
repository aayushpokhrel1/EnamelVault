import type { Ingredient, Step, Visibility } from "../lib/api/types";
import type { Row, Store } from "./store/types";
import type { DraftPayload } from "./sync/outbox";

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
