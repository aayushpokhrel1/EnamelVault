import { findDurations } from "../lib/stepDuration";
import type { Row, Store } from "./store/types";

/** A duration the step text mentions, and where in the text it was found. */
export type StepTimer = { label: string; seconds: number; matchIndex: number };

/**
 * A timer that is counting down. It is an END TIME, never a remaining count, which is the
 * whole reason it can survive the phone being locked, the app being killed and the clock
 * being read again an hour later. Nothing in here ticks.
 */
export type RunningTimer = { id: string; recipeId: string; label: string; endsAt: string };

/** What `notify.ts` provides over expo-notifications. An interface so the core stays testable. */
export type Notifier = {
  schedule: (timer: RunningTimer) => Promise<void>;
  cancel: (id: string) => Promise<void>;
};

/**
 * The web app's parser, not a second one. Its rules were paid for rather than guessed: the
 * unit must match as a whole word or "500 mg" becomes five hundred minutes, a range rings at
 * the longer end so nothing burns, and "half an hour" is rejected because a qualifier the
 * parser cannot do arithmetic on would ring at the wrong time. A phone-only copy would
 * relearn every one of those in a kitchen.
 */
export function timersInStep(text: string): StepTimer[] {
  return findDurations(text).map((found) => ({
    label: found.label,
    seconds: found.seconds,
    matchIndex: found.index,
  }));
}

const timerFrom = (row: Row): RunningTimer => ({
  id: row.id,
  recipeId: String(row.recipe_id ?? ""),
  label: String(row.label ?? ""),
  endsAt: String(row.ends_at ?? ""),
});

const byEnd = (a: RunningTimer, b: RunningTimer): number => a.endsAt.localeCompare(b.endsAt);

export async function startTimer(
  store: Store,
  recipeId: string,
  label: string,
  seconds: number,
  now: Date,
): Promise<RunningTimer> {
  const timer: RunningTimer = {
    id: `timer-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    recipeId,
    label,
    endsAt: new Date(now.getTime() + seconds * 1000).toISOString(),
  };
  await store.put("timers", {
    id: timer.id,
    recipe_id: timer.recipeId,
    label: timer.label,
    ends_at: timer.endsAt,
  });
  return timer;
}

export async function allTimers(store: Store): Promise<RunningTimer[]> {
  return (await store.all<Row>("timers")).map(timerFrom).sort(byEnd);
}

/** Every timer whose end time has passed. Soonest first, the order they rang in. */
export async function dueTimers(store: Store, now: Date): Promise<RunningTimer[]> {
  const at = now.toISOString();
  return (await allTimers(store)).filter((timer) => timer.endsAt <= at);
}

export async function cancelTimer(store: Store, notifier: Notifier, id: string): Promise<void> {
  await store.remove("timers", id);
  await notifier.cancel(id);
}

/**
 * What launch and every foreground does. iOS drops pending notifications in cases the app does
 * not control (a force quit, a restore, a long enough sleep), so the only safe assumption is
 * that nothing we scheduled is still armed, and the re-arm has to be unconditional.
 *
 * An expired timer is REMOVED and returned rather than dropped silently: it rang while the
 * phone was in a pocket, or it never rang at all, and either way the cook has to be told. A
 * timer that disappears without a word is the one failure a kitchen cannot forgive.
 */
export async function rescheduleAll(
  store: Store,
  notifier: Notifier,
  now: Date,
): Promise<{ armed: RunningTimer[]; expired: RunningTimer[] }> {
  const armed: RunningTimer[] = [];
  const expired: RunningTimer[] = [];
  const at = now.toISOString();
  for (const timer of await allTimers(store)) {
    await notifier.cancel(timer.id);
    if (timer.endsAt <= at) {
      await store.remove("timers", timer.id);
      expired.push(timer);
      continue;
    }
    await notifier.schedule(timer);
    armed.push(timer);
  }
  return { armed, expired };
}
