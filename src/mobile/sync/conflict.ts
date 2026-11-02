import type { Recipe, Ingredient, Step } from "../../lib/api/types";
import type { DraftPayload, Intent } from "./outbox";

/** What the server currently holds for a recipe, as replay reads it back. */
export type ServerRecipe = {
  recipe: Recipe;
  ingredients: Ingredient[];
  steps: Step[];
  /** Whose version it is, for the screen to name. Null when the cook is not known locally. */
  authorName: string | null;
};

export type Conflict = {
  intentId: string;
  mine: DraftPayload;
  theirs: DraftPayload;
  theirsAuthor: string | null;
  theirsUpdatedAt: string;
};

/**
 * Compared as strings, EXACTLY as the server returned them. Parsing to Date and comparing
 * instants reintroduces the timezone class this repo has already paid for once (0067), and
 * buys nothing: the only question is whether this is the same revision the edit was based on,
 * which is an identity check, not an ordering one.
 *
 * A create has no base, so it can never conflict: there is nothing on the server yet to have
 * moved underneath it.
 */
export function hasMoved(intent: Intent, serverUpdatedAt: string): boolean {
  if (intent.baseUpdatedAt === null) return false;
  return intent.baseUpdatedAt !== serverUpdatedAt;
}

export function describeConflict(intent: Intent, server: ServerRecipe): Conflict {
  return {
    intentId: intent.id,
    // The cook's own version is always `mine`, whichever way round the screen chooses to
    // draw them. A screen that has to work out whose is whose will get it wrong once.
    mine: intent.payload,
    theirs: {
      title: server.recipe.title,
      prep_minutes: server.recipe.prep_minutes,
      cook_minutes: server.recipe.cook_minutes,
      visibility: server.recipe.visibility,
      ingredients: server.ingredients,
      steps: server.steps,
    },
    theirsAuthor: server.authorName,
    theirsUpdatedAt: server.recipe.updated_at,
  };
}
