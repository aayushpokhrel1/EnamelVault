import type { Row, Store } from "./store/types";
import { isLocalRecipeId } from "./sync/outbox";

export type SyncState = "synced" | "queued" | "failed" | "conflicted";

export type ShelfRow = {
  id: string;
  title: string;
  /** Whose recipe it was before it was saved, or null for the family's own. */
  byline: string | null;
  /** Prep and cook together, because that is the number a cook plans around. */
  minutes: number | null;
  sync: SyncState;
  /** The intent to open when `sync` is "conflicted". Null otherwise. */
  intentId: string | null;
};

const number = (value: unknown): number | null => (typeof value === "number" ? value : null);

const totalMinutes = (row: Row): number | null => {
  const prep = number(row.prep_minutes);
  const cook = number(row.cook_minutes);
  if (prep === null && cook === null) return null;
  return (prep ?? 0) + (cook ?? 0);
};

// Worst first. A recipe with one conflicted intent and one queued one is CONFLICTED: the
// state shown is the one that needs a person, because a row that says "queued" about work
// that is actually waiting on a decision is a row nobody ever taps.
const SEVERITY: SyncState[] = ["conflicted", "failed", "queued"];

export async function shelfRows(store: Store): Promise<ShelfRow[]> {
  const states = new Map<string, { sync: SyncState; intentId: string }>();
  for (const intent of await store.all<Row>("outbox")) {
    const recipeId = String(intent.recipe_id ?? "");
    const state = String(intent.state ?? "");
    const mapped: SyncState =
      state === "conflicted" ? "conflicted" : state === "failed" ? "failed" : "queued";
    const held = states.get(recipeId);
    if (!held || SEVERITY.indexOf(mapped) < SEVERITY.indexOf(held.sync)) {
      states.set(recipeId, { sync: mapped, intentId: intent.id });
    }
  }

  const rows = await store.all<Row>("recipes");
  return rows
    .map((row) => ({
      id: row.id,
      title: String(row.title ?? ""),
      // The cook a saved recipe came from. It is on the recipe itself, so a saved recipe
      // carries its byline offline like anything else: nothing here needs the network to
      // know whose dish this was.
      byline: row.source_cook_name === null || row.source_cook_name === undefined ? null : String(row.source_cook_name),
      minutes: totalMinutes(row),
      // A recipe created offline has no server id and no intent state of its own beyond its
      // create, which is already in the map. It belongs on the shelf from the moment it is
      // written: a cook who typed a recipe on a train must see it.
      sync: states.get(row.id)?.sync ?? (isLocalRecipeId(row.id) ? "queued" : "synced"),
      // Only for a conflict, because that is the only state the cook can act on. Carrying
      // it for every row would invite a screen to open a settled intent.
      intentId: states.get(row.id)?.sync === "conflicted" ? (states.get(row.id)?.intentId ?? null) : null,
    }))
    // By title, ignoring case, because a shelf sorted by a hidden id or by insertion order
    // is a shelf nobody can find anything on.
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}
