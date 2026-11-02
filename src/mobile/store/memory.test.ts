import { describe, it, expect } from "vitest";
import { createMemoryStore } from "./memory";
import { CONTRACT } from "./contract";

describe("the Store contract, against the memory store", () => {
  // The same list the SQLite store is checked against on the device, where there is no test
  // runner. Two implementations of one interface drift the moment each has its own tests.
  for (const contractCase of CONTRACT) {
    it(contractCase.name, async () => {
      await contractCase.run(createMemoryStore());
    });
  }
});

describe("the memory store's own promises", () => {
  it("hands back a copy, so a caller cannot mutate the store by editing what it read", async () => {
    const store = createMemoryStore();
    await store.put("recipes", { id: "1", title: "Dal" });

    const read = await store.get("recipes", "1");
    read!.title = "Changed";
    const rows = await store.all("recipes");
    rows[0].title = "Changed again";

    expect((await store.get("recipes", "1"))?.title).toBe("Dal");
  });

  it("does not keep a reference to the row it was handed", async () => {
    const store = createMemoryStore();
    const row = { id: "1", title: "Dal" };
    await store.put("recipes", row);
    row.title = "Changed after the write";
    expect((await store.get("recipes", "1"))?.title).toBe("Dal");
  });
});
