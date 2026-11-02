import type { Visibility, Ingredient, Step } from "../../lib/api/types";
import type { Store, Row, TableName } from "../store/types";

// The draft a queued write carries. It is defined HERE rather than imported from the web
// app, because the web app's draft shape belongs to the web app's write path and the two
// are free to diverge. The field names match the server's columns on purpose, so replay
// does not have to invent a mapping of its own.
export type DraftPayload = {
  // Which family the recipe belongs to. A create made offline has to carry it: the server
  // cannot infer it, and a cook in two families would otherwise have their recipe land in
  // whichever one the server guessed. An edit carries it unchanged.
  family_id: string;
  title: string;
  prep_minutes: number | null;
  cook_minutes: number | null;
  visibility: Visibility;
  ingredients: Ingredient[];
  steps: Step[];
};

export type IntentState = "queued" | "sending" | "failed" | "conflicted";

export type Intent = {
  id: string;
  kind: "create" | "edit";
  recipeId: string;
  baseUpdatedAt: string | null;
  payload: DraftPayload;
  createdAt: string;
  state: IntentState;
  error: string | null;
};

const LOCAL_PREFIX = "local:";

/**
 * The temporary id a create carries until the server gives it one. The `local:` prefix is
 * load-bearing: a bare random string would be indistinguishable from a uuid at a glance,
 * and the whole point is that no code can mistake one for a recipe the server knows about.
 *
 * Not crypto.randomUUID: this core also runs under Hermes, where it is not guaranteed.
 */
export function localRecipeId(): string {
  return `${LOCAL_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isLocalRecipeId(id: string): boolean {
  return id.startsWith(LOCAL_PREFIX);
}

const text = (row: Row, key: string): string => String(row[key] ?? "");
const textOrNull = (row: Row, key: string): string | null => {
  const value = row[key];
  return value === null || value === undefined ? null : String(value);
};

const toRow = (intent: Intent): Row => ({
  id: intent.id,
  kind: intent.kind,
  recipe_id: intent.recipeId,
  base_updated_at: intent.baseUpdatedAt,
  // The object itself, not JSON. The column type is `json` and serialising is the SQLite
  // adapter's job: a core that stringifies here would store a string of a string there.
  payload: intent.payload,
  created_at: intent.createdAt,
  state: intent.state,
  error: intent.error,
});

const toIntent = (row: Row): Intent => ({
  id: row.id,
  kind: text(row, "kind") === "edit" ? "edit" : "create",
  recipeId: text(row, "recipe_id"),
  baseUpdatedAt: textOrNull(row, "base_updated_at"),
  payload: row.payload as DraftPayload,
  createdAt: text(row, "created_at"),
  state: text(row, "state") as IntentState,
  error: textOrNull(row, "error"),
});

export async function enqueue(store: Store, intent: Intent): Promise<void> {
  await store.put("outbox", toRow(intent));
}

/**
 * Queued and failed only. A `conflicted` intent is waiting on a person to choose between two
 * versions, so replaying it would be sending a decision nobody made; a `sending` one is
 * already in flight.
 */
export async function pending(store: Store): Promise<Intent[]> {
  const rows = await store.all<Row>("outbox");
  return rows
    .filter((row) => text(row, "state") === "queued" || text(row, "state") === "failed")
    // Compared as strings, not parsed to Date: these are ISO-8601 from one clock, so they
    // sort lexically, and parsing is how this repo has already shipped a timezone defect.
    .sort((a, b) => text(a, "created_at").localeCompare(text(b, "created_at")))
    .map(toIntent);
}

async function repointChildren(tx: Store, table: TableName, localId: string, serverRecipeId: string) {
  for (const row of await tx.all<Row>(table)) {
    if (text(row, "recipe_id") !== localId) continue;
    // REMOVE BY THE OLD ID FIRST, then put under the new one. Mutating the row and then
    // removing by row.id deletes the key that was just invented and leaves the real row
    // behind, which is a duplicate under a recipe id the server has never heard of.
    await tx.remove(table, row.id);
    await tx.put(table, { ...row, id: `${serverRecipeId}:${String(row.position)}`, recipe_id: serverRecipeId });
  }
}

async function repointReferences(tx: Store, table: TableName, localId: string, serverRecipeId: string) {
  for (const row of await tx.all<Row>(table)) {
    if (text(row, "recipe_id") !== localId) continue;
    await tx.put(table, { ...row, recipe_id: serverRecipeId });
  }
}

/**
 * The intent is REMOVED from the outbox, which is what makes a crash between the server
 * write and this call safe: the queue no longer holds it, so the next replay cannot send it
 * a second time and leave the cook with two identical recipes.
 *
 * When the intent was a create, its `local:` id is rewritten to the server's everywhere it
 * appears, inside ONE transaction. Everywhere includes later queued intents: an edit made
 * offline after the create targets the local id, and replaying it against an id the server
 * never heard of is a refusal that looks like a bug.
 */
export async function markSent(store: Store, intentId: string, serverRecipeId: string): Promise<void> {
  await store.transaction(async (tx) => {
    const row = await tx.get<Row>("outbox", intentId);
    if (!row) return;
    await tx.remove("outbox", intentId);

    const localId = text(row, "recipe_id");
    if (!isLocalRecipeId(localId)) return;

    const recipe = await tx.get<Row>("recipes", localId);
    if (recipe) {
      await tx.remove("recipes", localId);
      await tx.put("recipes", { ...recipe, id: serverRecipeId });
    }
    await repointChildren(tx, "recipe_ingredients", localId, serverRecipeId);
    await repointChildren(tx, "recipe_steps", localId, serverRecipeId);
    await repointReferences(tx, "meal_plan_items", localId, serverRecipeId);
    await repointReferences(tx, "outbox", localId, serverRecipeId);
  });
}

async function setState(store: Store, intentId: string, state: IntentState, error: string | null) {
  const row = await store.get<Row>("outbox", intentId);
  if (!row) return;
  await store.put("outbox", { ...row, state, error });
}

/** A failed intent stays in the outbox and stays pending: the next replay retries it. */
export async function markFailed(store: Store, intentId: string, message: string): Promise<void> {
  await setState(store, intentId, "failed", message);
}

export async function markConflicted(store: Store, intentId: string): Promise<void> {
  await setState(store, intentId, "conflicted", null);
}
