import { describe, it, expect } from "vitest";
import { isKitchenHost, isSharedAsset, kitchenRobots, KITCHEN_HOST } from "./kitchen";

describe("the kitchen host", () => {
  it("matches the host exactly, and not a suffix of it", () => {
    expect(isKitchenHost(KITCHEN_HOST)).toBe(true);
    expect(isKitchenHost(KITCHEN_HOST.toUpperCase())).toBe(true);
    // The reason this is an exact match and not endsWith: anything that later trusts this
    // host would be trusting an attacker's.
    expect(isKitchenHost(`${KITCHEN_HOST}.evil.example`)).toBe(false);
    expect(isKitchenHost(`not${KITCHEN_HOST}`)).toBe(false);
    expect(isKitchenHost("recipes.enamelvault.com")).toBe(false);
    expect(isKitchenHost("enamelvault.com")).toBe(false);
  });

  it("recognises the assets both apps share, which must be served not rewritten", () => {
    // The built bundle, the mark, the fonts and the theme bootstrap. A rewrite of any of
    // these to the app shell would serve HTML as javascript, and the page would fail with no
    // obvious cause.
    expect(isSharedAsset("/assets/kitchen-a1b2c3.js")).toBe(true);
    expect(isSharedAsset("/assets/index-d4e5f6.css")).toBe(true);
    expect(isSharedAsset("/favicon.svg")).toBe(true);
    expect(isSharedAsset("/apple-touch-icon.png")).toBe(true);
    expect(isSharedAsset("/fonts/zilla-slab-700-latin.woff2")).toBe(true);
    expect(isSharedAsset("/theme-init.js")).toBe(true);
    // Routes of the app, which must fall through to the shell instead.
    expect(isSharedAsset("/")).toBe(false);
    expect(isSharedAsset("/orgs/new")).toBe(false);
    expect(isSharedAsset("/join/abc123")).toBe(false);
    // No traversal, and no suffix trick.
    expect(isSharedAsset("/assets/../index.html")).toBe(false);
    expect(isSharedAsset("/evil/assets/x.js")).toBe(false);
  });

  it("asks every crawler to stay out while the product is in development", () => {
    const robots = kitchenRobots();
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Disallow: /");
    // No sitemap line: there is nothing here anybody should index yet, and the public
    // landing page says this product is in development.
    expect(robots).not.toContain("Sitemap");
  });
});
