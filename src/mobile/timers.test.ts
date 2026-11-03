import { describe, it, expect, beforeEach } from "vitest";
import type { Store } from "./store/types";
import { createMemoryStore } from "./store/memory";
import type { Notifier, RunningTimer } from "./timers";
import { allTimers, cancelTimer, dueTimers, rescheduleAll, startTimer, timersInStep } from "./timers";

const fakeNotifier = (): Notifier & { scheduled: string[]; cancelled: string[] } => {
  const scheduled: string[] = [];
  const cancelled: string[] = [];
  return {
    scheduled,
    cancelled,
    schedule: async (timer: RunningTimer) => void scheduled.push(timer.id),
    cancel: async (id: string) => void cancelled.push(id),
  };
};

describe("timersInStep", () => {
  it("a duration in the step text becomes a timer", () => {
    expect(timersInStep("Simmer for 25 minutes, stirring now and then")).toEqual([
      { label: "25 minutes", seconds: 1500, matchIndex: 11 },
    ]);
  });

  it("a quantity in a step does not", () => {
    // The reason the web parser demands a whole-word unit. "20 ml" holds the letter m, and a
    // looser match turns a splash of milk into a twenty minute wait at the stove.
    expect(timersInStep("Add 20 ml of milk and 500 mg of saffron")).toEqual([]);
  });

  it("a range rings at the longer end, because nothing burns by waiting", () => {
    expect(timersInStep("Bake 10-12 minutes").map((t) => t.seconds)).toEqual([720]);
  });

  it("two durations in one step are two timers, told apart by where they were found", () => {
    const found = timersInStep("Fry 5 minutes, then rest 5 minutes");
    expect(found.map((t) => t.seconds)).toEqual([300, 300]);
    // Identical label and identical length. Position is the only thing that distinguishes
    // them, which is why it travels with the timer rather than being recomputed later.
    expect(found[0].matchIndex).not.toBe(found[1].matchIndex);
  });
});

describe("running timers", () => {
  let store: Store;
  beforeEach(() => {
    store = createMemoryStore();
  });

  it("a timer is an end time, not a countdown", async () => {
    const started = await startTimer(store, "r1", "25 minutes", 1500, new Date("2026-11-02T18:00:00.000Z"));
    expect(started.endsAt).toBe("2026-11-02T18:25:00.000Z");
    // Nothing has ticked. No interval ran, the app was not even open. Moving the clock is the
    // only thing that happened, and the timer is due, because the end time is the whole state.
    expect(await dueTimers(store, new Date("2026-11-02T18:24:59.000Z"))).toEqual([]);
    expect(await dueTimers(store, new Date("2026-11-02T19:30:00.000Z"))).toEqual([started]);
  });

  it("three timers already due all ring", async () => {
    const start = new Date("2026-11-02T18:00:00.000Z");
    await startTimer(store, "r1", "ten", 600, start);
    await startTimer(store, "r1", "five", 300, start);
    await startTimer(store, "r2", "one", 60, start);
    // All three ended while the phone was in a pocket. Every one is reported, not just the
    // first or the latest: a cook who comes back to three finished things needs three.
    expect((await dueTimers(store, new Date("2026-11-02T18:20:00.000Z"))).map((t) => t.label)).toEqual([
      "one",
      "five",
      "ten",
    ]);
  });

  it("rescheduleAll re-arms every running timer and drops the expired", async () => {
    const start = new Date("2026-11-02T18:00:00.000Z");
    const gone = await startTimer(store, "r1", "one", 60, start);
    const still = await startTimer(store, "r1", "an hour", 3600, start);
    const notifier = fakeNotifier();

    const outcome = await rescheduleAll(store, notifier, new Date("2026-11-02T18:10:00.000Z"));
    expect(outcome.armed).toEqual([still]);
    expect(outcome.expired).toEqual([gone]);
    // Unconditional: the cancel covers the live one too, because iOS may or may not still
    // hold the notification we scheduled and there is no way to ask it.
    expect(notifier.cancelled.sort()).toEqual([gone.id, still.id].sort());
    expect(notifier.scheduled).toEqual([still.id]);
    expect(await allTimers(store)).toEqual([still]);
  });

  it("cancelling takes the timer and its notification together", async () => {
    const timer = await startTimer(store, "r1", "one", 60, new Date("2026-11-02T18:00:00.000Z"));
    const notifier = fakeNotifier();
    await cancelTimer(store, notifier, timer.id);
    expect(await allTimers(store)).toEqual([]);
    // Without this the phone rings for a timer the cook stopped, which reads as the app
    // ignoring them.
    expect(notifier.cancelled).toEqual([timer.id]);
  });
});
