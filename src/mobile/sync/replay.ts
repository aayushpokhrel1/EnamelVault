import type { DraftPayload, Intent } from "./outbox";
import type { Store } from "../store/types";
import type { ServerRecipe } from "./conflict";
import { hasMoved } from "./conflict";
import { markConflicted, markFailed, markSent, pending } from "./outbox";

/**
 * Every call hands back the row it wrote, because A WRITE REFUSED BY RLS IS NOT AN ERROR:
 * the policy does not reject the row, it fails to match one, so the request affects zero
 * rows and resolves with `error: null`. A resolved promise is not success. A returned row
 * is. This is the same rule `src/lib/api/` follows and the reason
 * `tests/integration/silent_refusals.test.ts` exists.
 */
export type RemoteResult<T> = { row: T | null; error: string | null };

export type Remote = {
  getRecipe(id: string): Promise<RemoteResult<ServerRecipe>>;
  createRecipe(payload: DraftPayload): Promise<RemoteResult<{ id: string }>>;
  /**
   * Lands through `publish_recipe_edit`, never a direct update of `recipes`: the publish
   * rules are a trigger, and a second write path is a second place to forget them.
   * `force` is what the conflict screen sends when the cook chooses to keep their version.
   */
  publishEdit(recipeId: string, payload: DraftPayload, force: boolean): Promise<RemoteResult<{ id: string }>>;
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
    const created = await remote.createRecipe(intent.payload);
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

  const published = await remote.publishEdit(intent.recipeId, intent.payload, false);
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
