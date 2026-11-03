import type { Intent } from "./outbox";
import type { Row, Store } from "../store/types";
import type { ServerRecipe } from "./conflict";
import { hasMoved } from "./conflict";
import { intentFrom, markConflicted, markFailed, markSent, pending } from "./outbox";

/**
 * Every call hands back the row it wrote, because A WRITE REFUSED BY RLS IS NOT AN ERROR:
 * the policy does not reject the row, it fails to match one, so the request affects zero
 * rows and resolves with `error: null`. A resolved promise is not success. A returned row
 * is. This is the same rule `src/lib/api/` follows and the reason
 * `tests/integration/silent_refusals.test.ts` exists.
 */
export type RemoteResult<T> = {
  row: T | null;
  error: string | null;
  /**
   * The server refused because the recipe moved under the edit. It is set by the adapter
   * from the custom SQLSTATE `publish_recipe_edit` raises, and it matters because the
   * SERVER'S check is the authoritative one: `hasMoved` below is only an early exit, and the
   * window between the two is exactly where somebody else's edit lands.
   */
  moved?: boolean;
};

export type Remote = {
  getRecipe(id: string): Promise<RemoteResult<ServerRecipe>>;
  createRecipe(intent: Intent): Promise<RemoteResult<{ id: string }>>;
  /**
   * Lands through `publish_recipe_edit`, never a direct update of `recipes`: the publish
   * rules are a trigger, and a second write path is a second place to forget them.
   * `force` is what the conflict screen sends when the cook chooses to keep their version.
   *
   * It takes the whole INTENT, not just the payload, because the draft it writes must carry
   * `base_updated_at` as it was when the edit was made. Handing it only the payload would
   * leave the draft to use the recipe's CURRENT timestamp, which makes the RPC's own
   * staleness check pass by construction. That check is the real one: the window between
   * hasMoved below and the write is exactly where somebody else's edit lands.
   */
  publishEdit(intent: Intent, force: boolean): Promise<RemoteResult<{ id: string }>>;
};

export type Outcome = "sent" | "conflicted" | "failed";

export const REFUSED =
  "The database would not accept this change. You may no longer be allowed to edit this recipe.";
export const GONE = "This recipe is no longer on the server, so this edit has nowhere to land.";

async function fail(store: Store, intent: Intent, message: string): Promise<Outcome> {
  await markFailed(store, intent.id, message);
  return "failed";
}

export async function replayOne(store: Store, remote: Remote, intent: Intent): Promise<Outcome> {
  if (intent.kind === "create") {
    const created = await remote.createRecipe(intent);
    if (created.error) return fail(store, intent, created.error);
    if (!created.row) return fail(store, intent, REFUSED);
    await markSent(store, intent.id, created.row.id);
    return "sent";
  }

  const current = await remote.getRecipe(intent.recipeId);
  if (current.error) return fail(store, intent, current.error);
  // Deleted on the server while the edit sat in the queue. The cook is told their edit has
  // nowhere to land, rather than watching it retry against nothing for ever.
  if (!current.row) return fail(store, intent, GONE);

  if (hasMoved(intent, current.row.recipe.updated_at)) {
    await markConflicted(store, intent.id);
    return "conflicted";
  }

  const published = await remote.publishEdit(intent, false);
  // Checked BEFORE error and before row: a move is a conflict, not a failure, and a failed
  // intent retries for ever against a recipe that will never match again.
  if (published.moved) {
    await markConflicted(store, intent.id);
    return "conflicted";
  }
  if (published.error) return fail(store, intent, published.error);
  if (!published.row) return fail(store, intent, REFUSED);
  await markSent(store, intent.id, published.row.id);
  return "sent";
}

/**
 * One failure never stops the queue: the rest of the cook's work is not hostage to the one
 * recipe they have lost access to.
 *
 * The queue is re-read on every pass rather than iterated once, because sending a create
 * REWRITES the recipe id of every intent queued after it. Iterating a snapshot would replay
 * a later edit against the `local:` id the server has never heard of.
 */
export async function replayAll(
  store: Store,
  remote: Remote,
): Promise<{ sent: number; conflicted: number; failed: number }> {
  const tally = { sent: 0, conflicted: 0, failed: 0 };
  const attempted = new Set<string>();
  for (;;) {
    const queue = await pending(store);
    const next = queue.find((intent) => !attempted.has(intent.id));
    if (!next) return tally;
    attempted.add(next.id);
    tally[await replayOne(store, remote, next)] += 1;
  }
}

/**
 * What the cook chose on the conflict screen.
 *
 * "theirs" DROPS the intent and leaves the server alone: the cook's version is gone, which
 * the screen says in those words before the tap rather than afterwards in a warning.
 *
 * "mine" republishes with force, which is what `publish_recipe_edit`'s p_force is for. A
 * resolution the database REFUSES is not a resolution: the intent stays conflicted so the
 * screen is still there, because the alternative is telling somebody their choice was taken
 * when nothing was written.
 */
export async function resolveConflict(
  store: Store,
  remote: Remote,
  intentId: string,
  keep: "mine" | "theirs",
): Promise<"sent" | "dropped" | "failed"> {
  const row = await store.get<Row>("outbox", intentId);
  if (!row) return "failed";
  const intent = intentFrom(row);

  if (keep === "theirs") {
    await store.remove("outbox", intentId);
    return "dropped";
  }

  // Routed by kind, exactly as replayOne is. A create forced through publishEdit would write
  // a draft targeting a `local:` id the server has never heard of, and the fake in a test
  // that does not check WHICH call was made will happily accept it.
  const published =
    intent.kind === "create" ? await remote.createRecipe(intent) : await remote.publishEdit(intent, true);
  if (published.error) {
    await markFailed(store, intentId, published.error);
    return "failed";
  }
  // force was true, so a refusal here is not staleness: it is a policy saying this cook may
  // not write this recipe at all. Still conflicted, because the cook has not been given an
  // outcome they can act on yet.
  if (!published.row) {
    await markFailed(store, intentId, REFUSED);
    return "failed";
  }
  await markSent(store, intentId, published.row.id);
  return "sent";
}
