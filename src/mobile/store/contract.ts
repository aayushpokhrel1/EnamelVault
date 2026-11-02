import type { Store } from "./types";
import { SCHEMA } from "./types";

/**
 * What a Store must do, as DATA rather than as tests, because there are two implementations
 * and only one of them can run under vitest. The memory store is checked by
 * `memory.test.ts`; the SQLite store is checked by the same list, on the device, where no
 * test runner exists. A contract written as vitest cases would have covered one of the two
 * and reported success for the other.
 *
 * No vitest import, no expect: these throw.
 */
export type ContractCase = { name: string; run: (store: Store) => Promise<void> };

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const same = (actual: unknown, expected: unknown, what: string): void =>
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );

export const CONTRACT: ContractCase[] = [
  {
    name: "a row that was put comes back",
    run: async (store) => {
      await store.put("recipes", { id: "1", title: "Dal" });
      same((await store.get("recipes", "1"))?.title, "Dal", "title");
    },
  },
  {
    name: "an unknown id is null, not undefined",
    run: async (store) => {
      assert((await store.get("recipes", "nobody")) === null, "expected null for an unknown id");
    },
  },
  {
    name: "all returns one table and never another",
    run: async (store) => {
      await store.put("recipes", { id: "1", title: "Dal" });
      await store.put("recipe_steps", { id: "1:0", recipe_id: "1", position: 0, text: "Rinse" });
      same((await store.all("recipes")).map((row) => row.id), ["1"], "recipes");
      same((await store.all("recipe_steps")).map((row) => row.id), ["1:0"], "steps");
    },
  },
  {
    name: "put replaces a row with the same id",
    run: async (store) => {
      await store.put("recipes", { id: "1", title: "Dal" });
      await store.put("recipes", { id: "1", title: "Khichdi" });
      const rows = await store.all("recipes");
      same(rows.length, 1, "row count");
      same(rows[0].title, "Khichdi", "title");
    },
  },
  {
    name: "remove takes one row and leaves the rest",
    run: async (store) => {
      await store.put("recipes", { id: "1", title: "Dal" });
      await store.put("recipes", { id: "2", title: "Khichdi" });
      await store.remove("recipes", "1");
      same((await store.all("recipes")).map((row) => row.id), ["2"], "remaining");
    },
  },
  {
    name: "removing an unknown id is not an error",
    run: async (store) => {
      await store.remove("recipes", "nobody");
    },
  },
  {
    name: "a null column round-trips as null, not as the string \"null\"",
    run: async (store) => {
      await store.put("recipes", { id: "1", title: "Dal", story: null, servings: null });
      const row = await store.get("recipes", "1");
      assert(row?.story === null, `story: expected null, got ${JSON.stringify(row?.story)}`);
      assert(row?.servings === null, `servings: expected null, got ${JSON.stringify(row?.servings)}`);
    },
  },
  {
    name: "an integer column round-trips as a number",
    run: async (store) => {
      await store.put("recipes", { id: "1", title: "Dal", servings: 4 });
      assert((await store.get("recipes", "1"))?.servings === 4, "servings must come back as the number 4");
    },
  },
  {
    name: "a json column round-trips as an object",
    run: async (store) => {
      await store.put("outbox", { id: "1", kind: "edit", payload: { title: "Dal", steps: [{ position: 0 }] } });
      const row = await store.get("outbox", "1");
      same(row?.payload, { title: "Dal", steps: [{ position: 0 }] }, "payload");
    },
  },
  {
    name: "a transaction that returns keeps its writes",
    run: async (store) => {
      await store.transaction(async (tx) => {
        await tx.put("recipes", { id: "1", title: "Dal" });
      });
      assert((await store.get("recipes", "1")) !== null, "the write must survive");
    },
  },
  {
    name: "a transaction that throws leaves nothing behind",
    run: async (store) => {
      let threw = false;
      try {
        await store.transaction(async (tx) => {
          await tx.put("recipes", { id: "1", title: "Dal" });
          throw new Error("rollback");
        });
      } catch {
        threw = true;
      }
      // Asserted OUTSIDE the catch: a transaction that failed to throw would skip the catch
      // and a check made in there would pass having checked nothing.
      assert(threw, "the error must propagate");
      assert((await store.get("recipes", "1")) === null, "the write must be gone");
    },
  },
  {
    name: "every table in SCHEMA can be written to",
    run: async (store) => {
      for (const table of SCHEMA) {
        await store.put(table.name, { id: "1" });
        assert((await store.get(table.name, "1")) !== null, `${table.name} is in SCHEMA but not usable`);
      }
    },
  },
];
