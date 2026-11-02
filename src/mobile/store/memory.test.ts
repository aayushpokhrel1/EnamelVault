import { describe, it, expect } from "vitest";
import { createMemoryStore } from "./memory";
import { SCHEMA } from "./types";

describe("MemoryStore", () => {
  it("a row that was put comes back", async () => {
    const store = createMemoryStore();
    const row = { id: "1", name: "Test" };
    await store.put("recipes", row);
    const result = await store.get("recipes", "1");
    expect(result).toEqual(row);
  });

  it("an unknown id is null, not undefined", async () => {
    const store = createMemoryStore();
    const result = await store.get("recipes", "1");
    expect(result).toBeNull();
  });

  it("all returns one table and never another", async () => {
    const store = createMemoryStore();
    const row1 = { id: "1", name: "Test1" };
    const row2 = { id: "2", name: "Test2" };
    await store.put("recipes", row1);
    await store.put("recipe_ingredients", row2);
    const recipes = await store.all("recipes");
    const ingredients = await store.all("recipe_ingredients");
    expect(recipes).toEqual([row1]);
    expect(ingredients).toEqual([row2]);
  });

  it("all hands back a copy, so a caller cannot mutate the store", async () => {
    const store = createMemoryStore();
    const row = { id: "1", name: "Test" };
    await store.put("recipes", row);
    const rows = await store.all("recipes");
    rows[0].name = "Modified";
    const result = await store.get("recipes", "1");
    expect(result).toEqual(row);
  });

  it("put replaces a row with the same id", async () => {
    const store = createMemoryStore();
    const row1 = { id: "1", name: "Test1" };
    const row2 = { id: "1", name: "Test2" };
    await store.put("recipes", row1);
    await store.put("recipes", row2);
    const result = await store.all("recipes");
    expect(result).toEqual([row2]);
  });

  it("a transaction that throws leaves nothing behind", async () => {
    const store = createMemoryStore();
    // The assertion must NOT live inside a catch: a transaction that failed to throw would
    // skip the catch entirely and the test would pass having checked nothing.
    await expect(
      store.transaction(async (tx) => {
        await tx.put("recipes", { id: "1", name: "Test" });
        throw new Error("Test error");
      }),
    ).rejects.toThrow("Test error");
    expect(await store.get("recipes", "1")).toBeNull();
  });

  it("a transaction that returns keeps its writes", async () => {
    const store = createMemoryStore();
    const row = { id: "1", name: "Test" };
    await store.transaction(async (tx) => {
      await tx.put("recipes", row);
    });
    const result = await store.get("recipes", "1");
    expect(result).toEqual(row);
  });

  it("every table in SCHEMA can be written to", async () => {
    const store = createMemoryStore();
    for (const table of SCHEMA) {
      const row = { id: "1" };
      await store.put(table.name, row);
      const result = await store.get(table.name, "1");
      expect(result).toEqual(row);
    }
  });
});