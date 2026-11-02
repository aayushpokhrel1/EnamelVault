import type { Ingredient, Recipe, Step } from "../../../src/lib/api/types";
import type { Intent } from "../../../src/mobile/sync/outbox";
import type { ServerRecipe } from "../../../src/mobile/sync/conflict";
import type { Remote, RemoteResult } from "../../../src/mobile/sync/replay";
import type { CatchUpRemote, PlanItem } from "../../../src/mobile/sync/catchup";
import { supabase } from "../supabase";

/**
 * The one place the phone app talks to Postgres, and the mirror of the rule that keeps all
 * Supabase access in `src/lib/api/` on the web: everything above this file works against the
 * narrow Remote and CatchUpRemote interfaces, which is why the sync logic is testable with
 * no network and no simulator.
 *
 * EVERY WRITE HERE RETURNS THE ROW IT WROTE. A write refused by RLS affects zero rows and
 * resolves with `error: null`, so a resolved promise proves nothing. `replayOne` reads
 * `row === null` as a refusal, and that only works if this file never invents one.
 */

const ok = <T,>(row: T): RemoteResult<T> => ({ row, error: null });
const failed = <T,>(error: string): RemoteResult<T> => ({ row: null, error });
const refused = <T,>(): RemoteResult<T> => ({ row: null, error: null });

async function myFamilyIds(): Promise<string[]> {
  const { data } = await supabase.from("family_members").select("family_id");
  return (data ?? []).map((row: { family_id: string }) => row.family_id);
}

async function childrenOf(ids: string[]) {
  if (ids.length === 0) return { ingredients: [], steps: [] };
  const [{ data: ingredients }, { data: steps }] = await Promise.all([
    supabase.from("recipe_ingredients").select("*").in("recipe_id", ids),
    supabase.from("recipe_steps").select("*").in("recipe_id", ids),
  ]);
  return { ingredients: ingredients ?? [], steps: steps ?? [] };
}

const byRecipe = <T extends { recipe_id: string }>(rows: T[]): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const held = out.get(row.recipe_id);
    if (held) held.push(row);
    else out.set(row.recipe_id, [row]);
  }
  return out;
};

const draftRow = (intent: Intent) => ({
  title: intent.payload.title,
  // title lives in its own column and everything else in `body`, exactly as
  // src/lib/api/drafts.ts toRow does it. Two converters is how the two drift and start
  // dropping a field only one of them knows about.
  body: {
    story: null,
    provenance: null,
    servings: null,
    prep_minutes: intent.payload.prep_minutes,
    cook_minutes: intent.payload.cook_minutes,
    ingredients: intent.payload.ingredients,
    steps: intent.payload.steps,
    source_url: null,
    visibility: intent.payload.visibility,
  },
});

export const remote: Remote & CatchUpRemote = {
  async getRecipe(id) {
    const [{ data: recipe, error }, children] = await Promise.all([
      supabase.from("recipes").select("*").eq("id", id).maybeSingle(),
      childrenOf([id]),
    ]);
    if (error) return failed(error.message);
    // Deleted, or no longer readable. Both are "not there" as far as an edit is concerned,
    // and replayOne turns that into a message rather than an endless retry.
    if (!recipe) return refused();

    const { data: author } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", (recipe as Recipe).author_id)
      .maybeSingle();

    return ok<ServerRecipe>({
      recipe: recipe as Recipe,
      ingredients: (children.ingredients as Ingredient[]).sort((a, b) => a.position - b.position),
      steps: (children.steps as Step[]).sort((a, b) => a.position - b.position),
      // Null when the profile cannot be read, which is a real outcome rather than a bug: the
      // conflict screen says "someone else" when it does not know who.
      authorName: author ? ((author as { display_name: string }).display_name ?? null) : null,
    });
  },

  async createRecipe(intent) {
    const { data: me } = await supabase.auth.getUser();
    if (!me.user) return failed("You are not signed in any more.");

    const { data: created, error } = await supabase
      .from("recipes")
      .insert({
        family_id: intent.payload.family_id,
        author_id: me.user.id,
        title: intent.payload.title,
        prep_minutes: intent.payload.prep_minutes,
        cook_minutes: intent.payload.cook_minutes,
        visibility: intent.payload.visibility,
      })
      .select("id")
      .maybeSingle();
    if (error) return failed(error.message);
    if (!created) return refused();
    const id = (created as { id: string }).id;

    // Children after the parent, and a failure here is still a failure of the whole intent:
    // a recipe with no ingredients is not what the cook typed. The recipe row stays, because
    // deleting it would lose the title too; the next replay rewrites the children.
    if (intent.payload.ingredients.length > 0) {
      const { error: childError } = await supabase.from("recipe_ingredients").insert(
        intent.payload.ingredients.map((ingredient, index) => ({
          recipe_id: id,
          position: index,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          item: ingredient.item,
          section: ingredient.section ?? null,
          optional: ingredient.optional ?? false,
          alt_group: ingredient.alt_group ?? null,
        })),
      );
      if (childError) return failed(childError.message);
    }
    if (intent.payload.steps.length > 0) {
      const { error: stepError } = await supabase
        .from("recipe_steps")
        .insert(intent.payload.steps.map((step, index) => ({ recipe_id: id, position: index, text: step.text })));
      if (stepError) return failed(stepError.message);
    }
    return ok({ id });
  },

  async publishEdit(intent, force) {
    const { data: me } = await supabase.auth.getUser();
    if (!me.user) return failed("You are not signed in any more.");

    const { data: draft, error: draftError } = await supabase
      .from("recipe_drafts")
      .insert({
        ...draftRow(intent),
        author_id: me.user.id,
        target_family_id: intent.payload.family_id,
        target_recipe_id: intent.recipeId,
        // The timestamp the edit was made against, NOT the recipe's current one. This is what
        // lets the RPC refuse a stale edit; passing the current value would make its check
        // pass by construction and leave the client's own check as the only one, with a
        // window between them that is exactly where somebody else's edit lands.
        base_updated_at: intent.baseUpdatedAt,
      })
      .select("id")
      .maybeSingle();
    if (draftError) return failed(draftError.message);
    if (!draft) return refused();

    const { data, error } = await supabase.rpc("publish_recipe_edit", {
      p_draft: (draft as { id: string }).id,
      p_force: force,
    });
    if (error) {
      // DRF01 is the custom SQLSTATE 0058 raises for "the recipe moved". It is a CONFLICT,
      // not a failure: the server's check is the authoritative one, and the client's hasMoved
      // is only an early exit.
      if (error.code === "DRF01") return { row: null, error: null, moved: true };
      return failed(error.message);
    }
    if (!data) return refused();
    return ok({ id: String(data) });
  },

  async listRecipes() {
    const families = await myFamilyIds();
    if (families.length === 0) return [];
    // Every recipe of every family this account belongs to, not an "active" family. A cook
    // in two families who could only see one of them on their phone would think the other
    // had gone.
    const { data: recipes, error } = await supabase.from("recipes").select("*").in("family_id", families);
    if (error) throw new Error(error.message);
    const rows = (recipes ?? []) as Recipe[];

    const children = await childrenOf(rows.map((row) => row.id));
    const ingredients = byRecipe(children.ingredients as (Ingredient & { recipe_id: string })[]);
    const steps = byRecipe(children.steps as (Step & { recipe_id: string })[]);

    return rows.map((recipe) => ({
      recipe,
      ingredients: (ingredients.get(recipe.id) ?? []).sort((a, b) => a.position - b.position),
      steps: (steps.get(recipe.id) ?? []).sort((a, b) => a.position - b.position),
      authorName: null,
    }));
  },

  async listPlanItems(from, to) {
    const { data, error } = await supabase
      .from("meal_plan_items")
      .select("id,plan_id,recipe_id,day,meal_slot")
      .gte("day", from)
      .lte("day", to);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: { id: string; plan_id: string; recipe_id: string; day: string; meal_slot: string | null }) => ({
      id: row.id,
      plan_id: row.plan_id,
      recipe_id: row.recipe_id,
      day: row.day,
      // The column is meal_slot on the server and `meal` on the device. Mapped HERE, once,
      // because this file is the seam: nothing above it should know the server's spelling.
      meal: row.meal_slot ?? "",
    })) as PlanItem[];
  },
};
