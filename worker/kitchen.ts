// The professional-kitchen app's host. Pure helpers only: worker/index.ts does the I/O, for
// the same reason worker/site.ts is shaped this way. HTMLRewriter and ASSETS have no
// implementation under Vitest, so everything that could be wrong lives here where a test can
// reach it.
export const KITCHEN_HOST = "kitchen.enamelvault.com";
export const KITCHEN_ORIGIN = `https://${KITCHEN_HOST}`;

// The built entry. It is fetched INTERNALLY and refused as a public path, exactly as
// site.html is, so the filename never appears in a URL anybody sees.
export const KITCHEN_ENTRY = "/kitchen.html";

// Exact match, not endsWith: kitchen.enamelvault.com.evil.example would pass that, and
// anything downstream that trusts this host would then be trusting an attacker's.
export function isKitchenHost(hostname: string): boolean {
  return hostname.toLowerCase() === KITCHEN_HOST;
}

/**
 * Paths that are real files in dist/ and must be SERVED on this host rather than rewritten
 * to the app shell.
 *
 * This exists because `not_found_handling: "single-page-application"` in wrangler.jsonc
 * serves dist/index.html, the FAMILY app, for anything with no matching file. So the kitchen
 * host has to rewrite its own routes to its own entry, and if that rewrite caught the bundle
 * as well, the browser would be served HTML where it asked for javascript.
 *
 * An allowlist, anchored, and it must stay one. ADD A FILE TO kitchen.html? Add it here.
 */
const SHARED_ASSET = /^\/(assets\/[A-Za-z0-9._-]+|favicon\.svg|apple-touch-icon\.png|og\.png|theme-init\.js|fonts\/[a-z0-9-]+\.woff2)$/;

export function isSharedAsset(pathname: string): boolean {
  return SHARED_ASSET.test(pathname);
}

// Disallow everything, and NOT for the reason this comment used to give.
//
// It used to say the landing page called the kitchen app "in development", so an indexed app
// on this host would make that claim false, and that this file and that sentence would change
// together. The sentence changed on 2026-10-15: the landing page now offers the app and links
// it. The Disallow stayed anyway, on a different and better reason.
//
// THE REASON NOW: this host serves an APP, not content. Every page behind it needs a session,
// so the only thing a crawler can ever reach is a sign-in form, and indexing that earns
// nothing while making the sign-in page compete with enamelvault.com for the product's own
// name. The landing page is the indexable surface and it describes the kitchen in full.
//
// So lifting this is a real decision about how the product is found, not a tidy-up that
// follows from the copy change. Whoever lifts it should want search traffic landing on a
// sign-in form.
export function kitchenRobots(): string {
  return ["User-agent: *", "Disallow: /", ""].join("\n");
}
