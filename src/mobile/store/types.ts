// No "saves" table, and that absence is deliberate. Saving a recipe from Potluck COPIES it
// into the family's vault (save_recipe_to_vault, 0027), so a saved recipe is an ordinary
// recipe row carrying source_recipe_id and source_cook_name. A local saves table would be a
// table nothing on the server corresponds to, which is a table that drifts.
export type TableName = "recipes" | "recipe_ingredients" | "recipe_steps" | "meal_plan_items" | "outbox" | "meta";

export type Row = { id: string } & Record<string, unknown>;

export type ColumnType = "text" | "integer" | "json";

export type TableSchema = { name: TableName; columns: Record<string, ColumnType> };

export interface Store {
  get<T extends Row>(table: TableName, id: string): Promise<T | null>;
  all<T extends Row>(table: TableName): Promise<T[]>;
  put(table: TableName, row: Row): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T>;
}

// A child row's `id` is `${recipe_id}:${position}` because the server's ingredient and step ids are optional in
// `Ingredient` and `Step`, so the device needs one it can always compute.

export const SCHEMA: TableSchema[] = [
  {
    name: "recipes",
    columns: {
      id: "text",
      family_id: "text",
      author_id: "text",
      title: "text",
      story: "text",
      provenance: "text",
      servings: "integer",
      prep_minutes: "integer",
      cook_minutes: "integer",
      visibility: "text",
      source_url: "text",
      created_at: "text",
      updated_at: "text",
      source_recipe_id: "text",
      source_cook_name: "text",
      adapted_at: "text",
      removed_at: "text",
      removed_reason: "text"
    }
  },
  {
    name: "recipe_ingredients",
    columns: {
      id: "text",
      recipe_id: "text",
      position: "integer",
      quantity: "text",
      unit: "text",
      item: "text",
      section: "text",
      optional: "integer",
      alt_group: "text"
    }
  },
  {
    name: "recipe_steps",
    columns: {
      id: "text",
      recipe_id: "text",
      position: "integer",
      text: "text"
    }
  },
  {
    name: "meal_plan_items",
    columns: {
      id: "text",
      plan_id: "text",
      recipe_id: "text",
      day: "text",
      meal: "text"
    }
  },
  {
    name: "outbox",
    columns: {
      id: "text",
      kind: "text",
      recipe_id: "text",
      base_updated_at: "text",
      payload: "json",
      created_at: "text",
      state: "text",
      error: "text"
    }
  },
  {
    name: "meta",
    columns: {
      id: "text",
      value: "text"
    }
  }
];