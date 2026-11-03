import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

// src/pages/Privacy.tsx says, in public, "Each one is listed here because the app actually
// sends data to it". That sentence was FALSE IN PRODUCTION for about two weeks, and this test
// exists because of it.
//
// What happened: the AI import's primary provider was switched to Google Gemini by setting the
// MODEL_BASE_URL secret. docs/OPERATIONS.md was updated. The privacy page was not, and it still
// said, under the Google heading, that Google was used for sign-in only and that "nothing else
// on this site reaches Google" while every photographed recipe card was being sent to Gemini.
// Nothing in the codebase changed, so no test, review or type check could have noticed.
//
// THE TRAP THIS CLOSES, AND WHY IT IS SHAPED ODDLY: who receives a user's recipe is a
// DEPLOY-TIME decision (a Supabase secret), not a code one. So grepping the source for fetch
// calls cannot find the answer, because the endpoint is never written in the source. The only
// place in the repo that records the real provider is docs/OPERATIONS.md, which is why this
// test reads prose rather than only code. It is a weaker guard than reading the live secret,
// and it is the strongest one that runs offline in `npm test`.
//
// WHEN THIS FAILS, you have two jobs, not one: name the company on the privacy page, and bump
// PRIVACY_UPDATED in src/lib/legal.ts so the date stops claiming the old list was current.
//
// WHEN YOU CHANGE MODEL_BASE_URL, the honest sequence is: edit Privacy.tsx, add the endpoint to
// AI_PROVIDERS below if it is new, update docs/OPERATIONS.md, deploy the page, THEN set the
// secret. Backwards means the page is a lie for as long as it takes you to notice.

const root = resolve(process.cwd());
const read = (p: string) => readFileSync(join(root, p), "utf8");

const privacy = read("src/pages/Privacy.tsx");
const operations = read("docs/OPERATIONS.md");

/** Every .ts/.tsx under a directory, recursively, excluding the tests themselves. */
function sourcesUnder(dir: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (rel: string) => {
    for (const entry of readdirSync(join(root, rel))) {
      if (entry === "node_modules" || entry === "dist") continue;
      const next = `${rel}/${entry}`;
      if (statSync(join(root, next)).isDirectory()) walk(next);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry))
        out.push({ path: next, text: read(next) });
    }
  };
  walk(dir);
  return out;
}

// `mobile/src` is listed separately from `src` because it is NOT under it: the phone app's
// Expo half lives in its own package, so a guard that walked `src` alone reported success for
// an entire outbound surface it could not see. That is the same shape as the terms guard which
// covered one router of three while the kitchen app shipped ungated. A new app directory is
// another line here, and forgetting it is silent.
const code = [
  ...sourcesUnder("src"),
  ...sourcesUnder("mobile/src"),
  ...sourcesUnder("supabase/functions"),
  ...sourcesUnder("worker"),
];

// Every AI endpoint this project has ever been pointed at, and the company name that MUST then
// appear on the privacy page. Add a row before pointing a secret at a new one. The point of
// listing retired ones (OpenRouter, NVIDIA) is that re-enabling one is a secret change with no
// diff, so the row has to outlive the configuration.
//
// EACH ROW NAMES A PRODUCT, NOT A COMPANY, AND THAT IS THE WHOLE POINT. Keying Gemini on the
// word "Google" is worthless, because the page says "Google" anyway for sign-in: the original
// bug was a page that named Google, truthfully, for the wrong reason. Written as "Google" this
// test passes while the page is still misleading. It was written that way first, and a mutation
// run (delete Gemini from the page, watch the test pass) is what exposed it.
const AI_PROVIDERS = [
  { host: "generativelanguage.googleapis.com", marker: /gemini/i, name: "Gemini" },
  { host: "api.deepseek.com", marker: /deepseek/i, name: "DeepSeek" },
  { host: "api.groq.com", marker: /groq/i, name: "Groq" },
  { host: "openrouter.ai", marker: /openrouter/i, name: "OpenRouter" },
  { host: "integrate.api.nvidia.com", marker: /nvidia/i, name: "NVIDIA" },
  { host: "api.openai.com", marker: /openai/i, name: "OpenAI" },
  { host: "api.anthropic.com", marker: /anthropic|claude/i, name: "Anthropic" },
  { host: "api.mistral.ai", marker: /mistral/i, name: "Mistral" },
  { host: "api.cerebras.ai", marker: /cerebras/i, name: "Cerebras" },
  { host: "api.x.ai", marker: /xai|grok/i, name: "xAI" },
  { host: "api.together.xyz", marker: /together/i, name: "Together" },
  { host: "api.fireworks.ai", marker: /fireworks/i, name: "Fireworks" },
];

// Hosts that appear in the code but receive no user data, so they are not processors. Each one
// needs a reason, because "it looked harmless" is how a font CDN gets added back.
const NOT_A_PROCESSOR = [
  "schema.org", // A JSON-LD vocabulary URL in a string. Nothing is ever requested from it.
  "recipes.enamelvault.com", // Our own canonical origin.
  "enamelvault.com",
  "kitchen.enamelvault.com",
  "example.com", // Fixtures and doc comments.
  "ico.org.uk", // A link we render for UK users to complain ABOUT us.
  "localhost",
  "host.docker.internal", // Local-only model endpoint for development.
  "www.w3.org", // SVG/XML namespace attribute, not a request.
  "search.google.com", // A link in OPERATIONS.md for a human to click, not a call.
  "fonts.googleapis.com", // Must stay absent from code; see the dedicated test below.
  "fonts.gstatic.com",
  // The SSRF denylist in supabase/functions/extract-recipe/limits.ts. These appear in the code
  // precisely so that `url` mode REFUSES them, so finding them here is the guard working, not a
  // leak. 169.254.169.254 is the cloud metadata address: the one address where a server-side
  // fetch of a user-supplied URL turns into stolen credentials.
  "127.0.0.1",
  "localhost.",
  "169.254.169.254",
  "evil.example", // A hostile URL in a test fixture for that denylist.
  "www.sitemaps.org", // An XML namespace attribute in the generated sitemap. Not a request.
];

it("names every AI provider the app can be pointed at", () => {
  // Scan the DOCS as well as the code, because the endpoint lives in a secret and the docs are
  // the only in-repo record of which one is live.
  const haystack = code.map((f) => f.text).join("\n") + "\n" + operations;
  const undisclosed = AI_PROVIDERS.filter(
    ({ host, marker }) => haystack.includes(host) && !marker.test(privacy),
  );
  expect(
    undisclosed.map((p) => `${p.host} is configured or documented, but Privacy.tsx never names ${p.name}`),
  ).toEqual([]);
});

it("discloses the AI import under Google, where a reader will actually look", () => {
  // THIS IS THE ORIGINAL BUG, WRITTEN AS A TEST. The page did name Google, truthfully, and the
  // sentence under that heading said Google was for sign-in and that nothing else reached it.
  // Someone worried about Google reads that entry and stops. So it is not enough for the import
  // to be disclosed SOMEWHERE on the page: while the model is Google's, the Google entry itself
  // has to say so.
  if (!/generativelanguage\.googleapis\.com/.test(operations)) return; // Not on Google today.
  const entry = privacy.slice(privacy.indexOf("<dt>Google</dt>"));
  const googleSection = entry.slice(0, entry.indexOf("</dd>"));
  expect(
    /gemini/i.test(googleSection),
    "the <dt>Google</dt> entry in Privacy.tsx must mention Gemini, not only sign-in",
  ).toBe(true);
  expect(
    /nothing else/i.test(googleSection),
    'the Google entry must not claim "nothing else" reaches Google while Gemini reads recipes',
  ).toBe(false);
});

it("sends user data to no host that the privacy page has never heard of", () => {
  const known = [...AI_PROVIDERS.map((p) => p.host), ...NOT_A_PROCESSOR];
  // Companies named on the page whose hostnames we expect to see in the code.
  const disclosed = [
    { host: "supabase.co", company: "Supabase" },
    { host: "api.resend.com", company: "Resend" },
    // Cloudflare hosts the site AND counts page views from the edge-injected RUM beacon,
    // which worker/meta.ts has to allow in the CSP. It receives request data, so it is a
    // processor, not a NOT_A_PROCESSOR entry. Listing it here means deleting the Cloudflare
    // paragraph from Privacy.tsx fails the build.
    { host: "cloudflareinsights.com", company: "Cloudflare" },
  ];
  const hosts = new Set<string>();
  for (const { text } of code) {
    for (const match of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
      hosts.add(match[1].toLowerCase());
    }
  }
  const unknown = [...hosts].filter(
    (h) =>
      !known.some((k) => h === k || h.endsWith(`.${k}`)) &&
      !disclosed.some(({ host, company }) => h.endsWith(host) && privacy.includes(company)),
  );
  expect(
    unknown,
    "a new outbound host appeared: either add it to NOT_A_PROCESSOR with a reason, or name the company in Privacy.tsx",
  ).toEqual([]);
});

it("keeps the typeface off Google's network, which Cookies.tsx promises in public", () => {
  // Moved off Google Fonts deliberately, because it disclosed every visitor's IP to Google on
  // page load. src/pages/Cookies.tsx states that no page makes a third-party request at all.
  // HTML COMMENTS ARE STRIPPED FIRST, and that is not cosmetic: index.html carries a comment
  // explaining that the typeface USED to come from fonts.googleapis.com, so a naive substring
  // search fails on the very comment that records the fix. Caught by this test going red.
  const strip = (t: string) => t.replace(/<!--[\s\S]*?-->/g, "");
  const html = strip(read("index.html")) + strip(read("kitchen.html"));
  const offenders = [...code, { path: "index.html + kitchen.html", text: html }]
    .filter(({ text }) => /fonts\.(googleapis|gstatic)\.com/.test(text))
    .map(({ path }) => path);
  expect(offenders).toEqual([]);
});

// THE KITCHEN'S HALF, added when that app got a privacy page of its own.
//
// src/kitchen/pages/Privacy.tsx says in public that nothing entered on that host reaches an AI
// provider. That is true today, verified by the test below rather than by having looked once:
// src/kitchen and src/lib/api/kitchen contain no fetch, no functions.invoke, no extract-recipe
// and no errorLog, so their only outbound destination is Supabase.
//
// THE SHAPE IS DELIBERATELY NOT "NAME EVERY PROVIDER IN THE REPO". Requiring the kitchen page
// to name Gemini would make it a lie, because the kitchen app cannot reach Gemini. The check
// is the other direction: IF kitchen code can reach an endpoint, the kitchen page must name
// it. The claim being defended is one of ABSENCE, and an absence is exactly the kind of claim
// that rots silently, since adding a feature does not feel like editing a policy.
const kitchenPrivacy = read("src/kitchen/pages/Privacy.tsx");

it("names the processors the kitchen app really does use", () => {
  // Supabase holds the data, Cloudflare serves the page, Google is sign-in only. Each is on
  // the page because the app actually talks to it.
  for (const company of ["Supabase", "Cloudflare", "Google"]) {
    expect(
      kitchenPrivacy,
      `the kitchen privacy page no longer names ${company}, which the app still uses`,
    ).toContain(company);
  }
});

it("fails if the kitchen app gains an outbound call its privacy page denies", () => {
  const kitchenCode = code.filter(
    ({ path }) => path.startsWith("src/kitchen/") || path.includes("/api/kitchen/"),
  );
  expect(
    kitchenCode.length,
    "no kitchen sources were found, so this check is guarding nothing",
  ).toBeGreaterThan(5);

  // COMMENTS ARE STRIPPED FIRST, and that is not cosmetic. This went red on its first run,
  // naming src/kitchen/pages/Privacy.tsx itself: the page's header comment explains that the
  // kitchen app contains no fetch, no functions.invoke and no errorLog, so a raw search found
  // the very sentence that records the absence. The font check lower down this file learned
  // the same lesson about HTML comments, and a check that punishes the documentation it
  // depends on is a check somebody eventually silences.
  const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const reaching = kitchenCode
    .filter(({ text }) =>
      /\bfetch\s*\(|functions\s*\.\s*invoke|errorLog|extract-recipe/.test(stripComments(text)),
    )
    .map(({ path }) => path);

  expect(
    reaching,
    "The kitchen app now makes an outbound call, and src/kitchen/pages/Privacy.tsx states " +
      "under 'No AI reads your dishes' that it makes none beyond Supabase, and that no error " +
      "reports leave this host. Name the new destination on that page, bump " +
      "KITCHEN_PRIVACY_UPDATED in src/lib/legal.ts, and then decide whether this expectation " +
      "still describes the app.",
  ).toEqual([]);
});

it("keeps the kitchen page's claim of no AI provider honest in its own words", () => {
  // The page names the three providers it does NOT use, so that a reader who has heard of the
  // family app's importer gets a direct answer rather than silence. If an AI feature is ever
  // added here, this assertion is the one that should be deleted ON PURPOSE, in the same
  // commit as the wording change, rather than quietly surviving as a false statement.
  expect(kitchenPrivacy).toMatch(/no AI/i);
  for (const absent of ["Gemini", "DeepSeek", "Groq"]) {
    expect(kitchenPrivacy).toContain(absent);
  }
});
