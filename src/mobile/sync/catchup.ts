import type { Row, Store } from "../store/types";
import type { ServerRecipe } from "./conflict";
import { isLocalRecipeId, pending } from "./outbox";

export type PlanItem = { id: string; plan_id: string; recipe_id: string; day: string; meal: string };

/**
 * `listRecipes` returns EVERY recipe the cook can currently read, not the ones changed since
 * the last pull. An incremental list cannot express a recipe the cook has LOST access to,
 * because losing access is an absence, and the device would keep serving a private copy of a
 * recipe the family has taken back.
 *
 * The cost of that is a full list each catch-up. It is the right trade at a family's number
 * of recipes; if it ever stops being, the replacement is a list of ids plus a since-filtered
 * list of rows, not a quiet return to incremental.
 */
export type CatchUpRemote = {
  listRecipes(): Promise<ServerRecipe[]>;
  listPlanItems(from: string, to: string): Promise<PlanItem[]>;
};

const LAST_CAUGHT_UP = "last_caught_up_at";
const WINDOW_DAYS = 7;

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * The device's own calendar date, from the local parts. NEVER toISOString(): that converts
 * to UTC, so local midnight anywhere east of it reports the previous day and shifts a whole
 * planned week. `src/lib/dates.ts` says the same thing for the web app, and 0067 is what it
 * costs when a client-local date meets a server date that was computed differently.
 */
export function localDate(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** Today and the next six days, the window My Kitchen shows on the web. */
export function weekWindow(now: Date): { from: string; to: string } {
  const from = localDate(now);
  // Anchored at noon so a DST transition inside the window cannot move the date either.
  const end = new Date(`${from}T12:00:00`);
  end.setDate(end.getDate() + WINDOW_DAYS - 1);
  return { from, to: localDate(end) };
}

export async function lastCaughtUpAt(store: Store): Promise<string | null> {
  const row = await store.get<Row>("meta", LAST_CAUGHT_UP);
  return row ? String(row.value) : null;
}

async function replaceAll(store: Store, table: "meal_plan_items", rows: Row[]) {
  for (const existing of await store.all<Row>(table)) await store.remove(table, existing.id);
  for (const row of rows) await store.put(table, row);
}

async function writeRecipe(store: Store, server: ServerRecipe) {
  await store.put("recipes", { ...server.recipe });
  for (const table of ["recipe_ingredients", "recipe_steps"] as const) {
    for (const child of await store.all<Row>(table)) {
      if (child.recipe_id === server.recipe.id) await store.remove(table, child.id);
    }
  }
  for (const ingredient of server.ingredients) {
    await store.put("recipe_ingredients", {
      ...ingredient,
      id: `${server.recipe.id}:${ingredient.position}`,
      recipe_id: server.recipe.id,
    });
  }
  for (const step of server.steps) {
    await store.put("recipe_steps", {
      ...step,
      id: `${server.recipe.id}:${step.position}`,
      recipe_id: server.recipe.id,
    });
  }
}

export async function catchUp(
  store: Store,
  remote: CatchUpRemote,
  now: Date,
): Promise<{ pulled: number; dropped: number; at: string }> {
  const queued = new Set((await pending(store)).map((intent) => intent.recipeId));
  const server = await remote.listRecipes();
  const window = weekWindow(now);
  const planItems = await remote.listPlanItems(window.from, window.to);

  let pulled = 0;
  for (const recipe of server) {
    // The queue owns the rows it has pending writes for. Overwriting one would throw away
    // what the cook typed and show them the version they were in the middle of replacing.
    if (queued.has(recipe.recipe.id)) continue;
    await writeRecipe(store, recipe);
    pulled += 1;
  }

  const readable = new Set(server.map((recipe) => recipe.recipe.id));
  let dropped = 0;
  for (const local of await store.all<Row>("recipes")) {
    if (readable.has(local.id)) continue;
    // A recipe created offline has no server id yet, so its absence from the list means
    // nothing. Dropping it would delete the cook's unsent work.
    if (isLocalRecipeId(local.id) || queued.has(local.id)) continue;
    await store.remove("recipes", local.id);
    for (const table of ["recipe_ingredients", "recipe_steps"] as const) {
      for (const child of await store.all<Row>(table)) {
        if (child.recipe_id === local.id) await store.remove(table, child.id);
      }
    }
    dropped += 1;
  }

  await replaceAll(store, "meal_plan_items", planItems);

  // Written LAST, and only here: a pull that threw halfway leaves the old timestamp, so the
  // next attempt is a full catch-up rather than one that believes it is already current.
  const at = now.toISOString();
  await store.put("meta", { id: LAST_CAUGHT_UP, value: at });
  return { pulled, dropped, at };
}
