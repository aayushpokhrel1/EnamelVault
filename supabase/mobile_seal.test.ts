import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { expect, it } from "vitest";

/**
 * The seal is the entire justification for building the professional kitchen as a second app
 * rather than as a workspace type inside the family one. A seal nobody checks is a comment,
 * and this project's own history says the failure mode is not ignorance but not re-reading.
 *
 * Exactly ONE migration may mention the other schema. If a second one does, either move the
 * crossing into the bridge migration or admit in the spec that the seal is gone.
 */

const sourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
};

const resolveImport = (fromFile: string, spec: string): string | null => {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
};

// ingredientCategories is NOT on this list, and the test below is how that was discovered
// rather than assumed: it imports supabaseClient, so it is a data module wearing a helper's
// name. A list of "pure helpers" nobody checks is a list of guesses.
// lib/legal is allowed because it is CONSTANTS ONLY, and the test below holds it to that.
// TERMS_VERSION lives there so the phone gate compares against the same value the web gate
// does: a copy of a consent version is a copy that drifts, and the version is the only
// evidence of what somebody actually agreed to.
const ALLOWED_FROM_MOBILE = /(\/lib\/api\/(types|normalizeItem|quantity|units|primaryIngredients)|\/lib\/legal)$/;

it("no module under src/mobile imports react-native or expo", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles("src/mobile")) {
    const text = readFileSync(file, "utf8");
    for (const [, spec] of text.matchAll(/^\s*(?:import|export)[^'";]*?from\s+"([^"]+)"/gm)) {
      if (spec === "react-native" || spec.startsWith("react-native/") || spec === "expo" || spec.startsWith("expo-")) {
        offenders.push(`${file} imports ${spec}`);
      }
    }
  }
  expect(offenders).toEqual([]);
});

it("src/mobile imports nothing from src/lib except types and pure helpers", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles("src/mobile")) {
    const text = readFileSync(file, "utf8");
    for (const [, spec] of text.matchAll(/from\s+"([^"]+)"/g)) {
      if (!spec.includes("lib/")) continue;
      if (ALLOWED_FROM_MOBILE.test(spec)) continue;
      offenders.push(`${file} imports ${spec}`);
    }
  }
  expect(offenders).toEqual([]);
});

it("the helpers src/mobile is allowed to import touch no client", () => {
  const offenders: string[] = [];
  const helpers = [
    "src/lib/api/types.ts",
    "src/lib/api/normalizeItem.ts",
    "src/lib/api/quantity.ts",
    "src/lib/api/units.ts",
    "src/lib/api/primaryIngredients.ts",
    "src/lib/legal.ts",
  ];
  
  for (const helper of helpers) {
    if (!existsSync(helper)) continue;
    const text = readFileSync(helper, "utf8");
    for (const [, spec] of text.matchAll(/from\s+"([^"]+)"/g)) {
      if (spec.includes("supabaseClient")) {
        offenders.push(`${helper} imports ${spec}`);
      }
    }
  }
  expect(offenders).toEqual([]);
});

it("lib/legal is constants only, which is the whole reason it may be imported", () => {
  // The allowance above rests on this file having no imports at all. The moment it gains
  // one, "constants only" is a claim rather than a fact, and the phone core has a path into
  // the web app through a file nobody thinks of as code.
  const text = readFileSync("src/lib/legal.ts", "utf8");
  expect([...text.matchAll(/^\s*(?:import|export)[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1])).toEqual([]);
});

it("the phone app imports no web app page or component", () => {
  const offenders: string[] = [];
  const skipDirs = ["mobile/node_modules", "mobile/.expo", "mobile/ios", "mobile/android"];
  // THE COMPARISON IS MADE ON A NORMALISED PATH, and the first version of this test is why.
  // resolveImport returns an OS path, so on Windows it reads
  // "C:\...\src\components\Skeleton.tsx" and `includes("src/components")` is false for
  // every file on the machine this project is developed on. The test passed, and it passed
  // while an actual import of src/components sat in mobile/app/index.tsx, which is the only
  // reason the hole was found: the probe that was supposed to turn it red did not.
  const WEB = /(^|\/)src\/(pages|components|kitchen|admin)\//;
  for (const file of sourceFiles("mobile")) {
    if (skipDirs.some((dir) => file.includes(dir))) continue;
    const text = readFileSync(file, "utf8");
    for (const [, spec] of text.matchAll(/^\s*(?:import|export)[^"';]*?from\s+"([^"]+)"/gm)) {
      const resolved = resolveImport(file, spec);
      const shown = resolved ? relative(process.cwd(), resolved).split(sep).join("/") : null;
      // An unresolvable specifier still counts. A path into the web app that does not exist
      // yet is a mistake now, not a mistake later.
      const raw = spec.split(sep).join("/");
      if ((shown && WEB.test(shown)) || WEB.test(raw)) {
        offenders.push(`${file} imports ${spec}`);
      }
    }
  }
  expect(offenders).toEqual([]);
});

it("follows transitive imports, so a shared module cannot smuggle a client in", () => {
  const offenders: string[] = [];
  const seen = new Set<string>();
  const queue: { file: string; chain: string[] }[] = sourceFiles("src/mobile").map((file) => ({
    file: resolve(file),
    chain: [file],
  }));
  
  while (queue.length > 0) {
    const { file, chain } = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const [, spec] of text.matchAll(/^\s*(?:import|export)[^'";]*?from\s+"([^"]+)"/gm)) {
      if (spec.includes("lib/api/") && !ALLOWED_FROM_MOBILE.test(spec)) {
        offenders.push([...chain, spec].join(" -> "));
        continue;
      }
      const next = resolveImport(file, spec);
      if (next && /\.tsx?$/.test(next)) {
        const shown = relative(process.cwd(), next).split(sep).join("/");
        queue.push({ file: next, chain: [...chain, shown] });
      }
    }
  }
  
  expect(offenders).toEqual([]);
});

/**
 * The phone app's router guard, and the reason it is HERE rather than under `mobile/`:
 * `npm test` runs `vitest run src supabase worker scripts`, so a test living beside the app
 * it guards would never run. This repo has already learned that a guard covering one of
 * several routers reports success for the app it cannot see, which is how the kitchen app
 * shipped its entire surface ungated with the suite green.
 *
 * expo-router is file-based, so there is no route list to read the way
 * `src/routes.terms.test.ts` reads the family router. The equivalent invariant is
 * structural: the only <Stack> in the app is in `_layout.tsx`, and it is inside <Gate>.
 * Nothing can escape a gate it is never rendered outside of.
 */
const appFiles = () => sourceFiles("mobile/app").map((file) => file.split(sep).join("/"));

// Comments are stripped FIRST, and the first version of this guard is why: the comment in
// _layout.tsx explaining the rule mentions <Stack> and <Gate>, so the test read its own
// documentation as code and failed on a file that was correct. A guard that cannot tell a
// comment from a component cannot tell anything.
const code = (file: string): string =>
  readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

it("the only router in the phone app is the one inside the gate", () => {
  const withStack = appFiles().filter((file) => /<Stack[\s/>]/.test(code(file)));
  expect(withStack).toEqual(["mobile/app/_layout.tsx"]);
});

it("the router is rendered inside <Gate>, and nothing else is", () => {
  const layout = code("mobile/app/_layout.tsx");
  const gate = layout.indexOf("<Gate>");
  const close = layout.indexOf("</Gate>");
  const stack = layout.search(/<Stack[\s/>]/);
  expect(gate, "_layout.tsx must render <Gate>").toBeGreaterThan(-1);
  expect(stack > gate && stack < close, "<Stack> must sit between <Gate> and </Gate>").toBe(true);
});

it("no screen reaches the client directly, so nothing can act before the gate has", () => {
  // A screen holding its own supabase import could fetch, write or sign out from outside the
  // store the gate handed it, which is the account boundary with an extra door in it.
  const offenders = appFiles().filter((file) => /from\s+"[^"]*\/supabase"/.test(code(file)));
  expect(offenders).toEqual([]);
});
