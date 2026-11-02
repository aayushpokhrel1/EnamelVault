import type { Store } from "./store/types";
import { pending } from "./sync/outbox";

/**
 * One local database per account, named from the USER ID and nothing else.
 *
 * Not the email: an email can change, and the day it does the cook would open the app to an
 * empty shelf while their real database sat on the device under its old name. Not a shared
 * database with a user_id column either: two cooks on one phone would then be one RLS
 * mistake away from reading each other's recipes locally, where there is no RLS at all.
 *
 * The user id is lowercased and stripped of anything that is not a hex digit or a dash, so
 * the name is a legal filename on every platform without depending on the id's format.
 */
export function storeNameFor(userId: string): string {
  const safe = userId.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (safe === "") throw new Error("A store name needs a user id.");
  return `familyrecipes-${safe}.db`;
}

/**
 * True while the outbox still holds work. Signing out would leave that work in a database
 * the next account cannot open, so the cook is warned and given the chance to get online
 * instead of silently losing what they typed.
 *
 * Conflicted intents count: they are unsent work waiting on a person, and discarding them is
 * the same loss as discarding a queued edit.
 */
export async function signOutBlocked(store: Store): Promise<boolean> {
  if ((await pending(store)).length > 0) return true;
  return (await store.all("outbox")).length > 0;
}
