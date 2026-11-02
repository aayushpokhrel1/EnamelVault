import { describe, it, expect, beforeEach } from "vitest";
import type { KeyValue } from "./chunkedStorage";
import { chunkedStorage } from "./chunkedStorage";

const fakeInner = () => {
  const held = new Map<string, string>();
  const inner: KeyValue & { held: Map<string, string> } = {
    held,
    getItem: async (key) => held.get(key) ?? null,
    setItem: async (key, value) => {
      held.set(key, value);
    },
    removeItem: async (key) => {
      held.delete(key);
    },
  };
  return inner;
};

const LIMIT = 10;

describe("chunkedStorage", () => {
  let inner: ReturnType<typeof fakeInner>;
  let storage: KeyValue;
  beforeEach(() => {
    inner = fakeInner();
    storage = chunkedStorage(inner, LIMIT);
  });

  it("a value longer than the limit round-trips", async () => {
    const value = "x".repeat(95);
    await storage.setItem("session", value);
    expect(await storage.getItem("session")).toBe(value);
    // Proof it really was split, rather than the limit being ignored.
    expect(inner.held.get("session")).toBe("chunked:10");
    expect(inner.held.get("session.0")).toHaveLength(LIMIT);
  });

  it("a short value round-trips too", async () => {
    await storage.setItem("session", "hi");
    expect(await storage.getItem("session")).toBe("hi");
  });

  it("an empty string is kept, and is not the same as absent", async () => {
    await storage.setItem("session", "");
    expect(await storage.getItem("session")).toBe("");
    expect(await storage.getItem("never-written")).toBeNull();
  });

  it("a shorter value leaves no part of the longer one behind", async () => {
    await storage.setItem("session", "y".repeat(95));
    await storage.setItem("session", "short");
    expect(await storage.getItem("session")).toBe("short");
    expect([...inner.held.keys()].sort()).toEqual(["session", "session.0"]);
  });

  it("a missing part reads as absent, never as a truncated value", async () => {
    const value = "z".repeat(95);
    await storage.setItem("session", value);
    inner.held.delete("session.4");
    // Half a session parses as corrupt and is shown as an error; absent is shown as
    // sign-in, which is the truth and is recoverable.
    expect(await storage.getItem("session")).toBeNull();
  });

  it("removeItem takes every part with it", async () => {
    await storage.setItem("session", "w".repeat(95));
    await storage.removeItem("session");
    expect(await storage.getItem("session")).toBeNull();
    expect(inner.held.size).toBe(0);
  });

  it("removing something that was never written is not an error", async () => {
    await storage.removeItem("nobody");
    expect(inner.held.size).toBe(0);
  });

  it("two keys do not read each other's parts", async () => {
    await storage.setItem("a", "a".repeat(95));
    await storage.setItem("b", "b".repeat(25));
    expect(await storage.getItem("a")).toBe("a".repeat(95));
    expect(await storage.getItem("b")).toBe("b".repeat(25));
  });

  it("a value that looks like a header is still just a value", async () => {
    // Every value goes through the header, so this is a value and not an instruction.
    await storage.setItem("session", "chunked:99");
    expect(await storage.getItem("session")).toBe("chunked:99");
  });
});
