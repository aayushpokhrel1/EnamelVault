// @vitest-environment node
//
// WHAT THIS FILE PINS: a kitchen group can read its own throughput, and nobody else can.
//
// `kitchen.group_numbers(p_org)` answers an owner or a chef with the dish counts, the funnel
// and a row per site, and answers everybody else with `{}` rather than a partial payload, so
// a site manager, a cook or a stranger calling it over HTTP learns nothing at all.
// `kitchen.my_group_numbers()` answers the same three figures keyed by org id, one key per
// group the caller runs, and `{}` for somebody who runs none.
//
// EVERY FIGURE IS ALL-TIME. There is no window and no "last 30 days" anywhere in these
// numbers, so a test that sets up three dishes is asserting on three dishes and not on three
// dishes since some date.
//
// The functions do not exist yet, so this file is expected to fail until they do.
import { describe, it, expect } from "vitest";
import { admin, makeUser } from "./helpers";

const stamp = () => Date.now() + Math.floor(Math.random() * 1000);
const kitchen = (c: Awaited<ReturnType<typeof makeUser>>["client"]) => c.schema("kitchen");

type Client = Awaited<ReturnType<typeof makeUser>>["client"];

type SiteNumbers = {
  id: string;
  name: string;
  substitutions: number;
  trials: number;
  last_recorded: string | null;
  added: string;
  closed: boolean;
};

type GroupNumbers = {
  dishes: { started: number; landed: number; median_days: number | null; slow: unknown[] };
  funnel: {
    dishes: number;
    with_version: number;
    trialled: number;
    landed: number;
    on_menu: number;
  };
  sites: SiteNumbers[];
};

type StripNumbers = { started: number; landed: number; median_days: number | null };

async function newOrg(owner: Client, name: string) {
  const { data } = await kitchen(owner).rpc("create_org", {
    p_name: name,
    p_display_name: "Sam",
  });
  return data as string;
}

async function newSite(owner: Client, orgId: string, name: string) {
  const { data } = await kitchen(owner).rpc("add_site", { p_org: orgId, p_name: name });
  return data as string;
}

async function newDish(owner: Client, orgId: string, title: string) {
  const { data } = await kitchen(owner).rpc("create_dish", { p_org: orgId, p_title: title });
  return data as string;
}

async function newVersion(owner: Client, dishId: string, note: string) {
  await kitchen(owner).rpc("revise_dish", {
    p_dish: dishId,
    p_note: note,
    p_ingredients: [{ position: 1, item: "water" }],
    p_steps: [{ position: 1, text: "boil it" }],
  });
  const { data: versions } = await kitchen(owner)
    .from("dish_versions")
    .select("id")
    .eq("dish_id", dishId);
  return versions![0].id as string;
}

// Only an owner may mint an invite, so every non-owner role arrives this way.
async function joinAs(owner: Client, orgId: string, role: string, siteId: string | null) {
  const { data: code } = await kitchen(owner).rpc("create_invite", {
    p_org: orgId,
    p_role: role,
    p_site: siteId,
  });
  const joiner = await makeUser(`kit-num-joiner-${stamp()}@t.dev`);
  await kitchen(joiner.client).rpc("accept_invite", { p_code: code, p_display_name: "Ruth" });
  return joiner;
}

describe("the kitchen's own throughput", () => {
  it("an owner sees the group's throughput", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "Numbers Group");
    const siteId = await newSite(owner.client, orgId, "Bridge Street");

    const first = await newDish(owner.client, orgId, "Soup");
    const second = await newDish(owner.client, orgId, "Stew");
    await newDish(owner.client, orgId, "Bread");

    await newVersion(owner.client, first, "first");
    const secondVersion = await newVersion(owner.client, second, "first");
    await kitchen(owner.client).rpc("send_to_trial", { p_dish: second, p_site: siteId });
    await kitchen(owner.client).rpc("sign_off", { p_version: secondVersion });

    const { data, error } = await kitchen(owner.client).rpc("group_numbers", { p_org: orgId });
    expect(error).toBeNull();
    const numbers = data as unknown as GroupNumbers;
    expect(numbers.dishes.started).toBe(3);
    expect(numbers.dishes.landed).toBe(1);
    expect(numbers.funnel.with_version).toBe(2);
    expect(numbers.funnel.trialled).toBe(1);
  });

  it("a chef sees the same numbers and no people key", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "Chef Numbers Group");
    const siteId = await newSite(owner.client, orgId, "Bridge Street");

    const first = await newDish(owner.client, orgId, "Soup");
    const second = await newDish(owner.client, orgId, "Stew");
    await newDish(owner.client, orgId, "Bread");
    await newVersion(owner.client, first, "first");
    const secondVersion = await newVersion(owner.client, second, "first");
    await kitchen(owner.client).rpc("send_to_trial", { p_dish: second, p_site: siteId });
    await kitchen(owner.client).rpc("sign_off", { p_version: secondVersion });

    const chef = await joinAs(owner.client, orgId, "chef", null);

    const { data: ownerData } = await kitchen(owner.client).rpc("group_numbers", {
      p_org: orgId,
    });
    const { data, error } = await kitchen(chef.client).rpc("group_numbers", { p_org: orgId });
    expect(error).toBeNull();
    const numbers = data as unknown as GroupNumbers;
    expect(numbers.dishes.started).toBe((ownerData as unknown as GroupNumbers).dishes.started);
    // Absent, not present and empty: the client is never trusted to ignore a key.
    expect(Object.keys(numbers)).not.toContain("people");
  });

  it("a site_manager gets an empty object", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "Manager Numbers Group");
    const siteId = await newSite(owner.client, orgId, "Bridge Street");
    await newDish(owner.client, orgId, "Soup");
    const manager = await joinAs(owner.client, orgId, "site_manager", siteId);

    const { data, error } = await kitchen(manager.client).rpc("group_numbers", { p_org: orgId });
    expect(error).toBeNull();
    expect(data).toEqual({});
  });

  it("a cook gets an empty object", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "Cook Numbers Group");
    const siteId = await newSite(owner.client, orgId, "Bridge Street");
    await newDish(owner.client, orgId, "Soup");
    const cook = await joinAs(owner.client, orgId, "cook", siteId);

    const { data, error } = await kitchen(cook.client).rpc("group_numbers", { p_org: orgId });
    expect(error).toBeNull();
    expect(data).toEqual({});
  });

  it("a stranger to the group gets an empty object", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "Stranger Numbers Group");
    await newDish(owner.client, orgId, "Soup");
    const stranger = await makeUser(`kit-num-stranger-${stamp()}@t.dev`);

    const { data, error } = await kitchen(stranger.client).rpc("group_numbers", { p_org: orgId });
    expect(error).toBeNull();
    expect(data).toEqual({});
  });

  it("a dish with no versions counts as started and is not in the median", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "Median Numbers Group");
    const siteId = await newSite(owner.client, orgId, "Bridge Street");

    const versioned = await newDish(owner.client, orgId, "Soup");
    await newDish(owner.client, orgId, "Bread");
    const versionId = await newVersion(owner.client, versioned, "first");
    await kitchen(owner.client).rpc("send_to_trial", { p_dish: versioned, p_site: siteId });
    await kitchen(owner.client).rpc("sign_off", { p_version: versionId });

    const { data, error } = await kitchen(owner.client).rpc("group_numbers", { p_org: orgId });
    expect(error).toBeNull();
    const numbers = data as unknown as GroupNumbers;
    expect(numbers.dishes.started).toBe(2);
    expect(numbers.dishes.landed).toBe(1);
    // The versionless dish is excluded from the median rather than counted as zero days.
    expect(numbers.dishes.median_days).toBe(0);
  });

  it("an empty group returns a null median and no error", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "Empty Numbers Group");

    const { data, error } = await kitchen(owner.client).rpc("group_numbers", { p_org: orgId });
    expect(error).toBeNull();
    const numbers = data as unknown as GroupNumbers;
    expect(numbers.dishes.median_days).toBeNull();
    expect(numbers.funnel.dishes).toBe(0);
  });

  it("a site with nothing recorded reports null last_recorded", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "Quiet Site Group");
    const siteId = await newSite(owner.client, orgId, "Bridge Street");

    const { data, error } = await kitchen(owner.client).rpc("group_numbers", { p_org: orgId });
    expect(error).toBeNull();
    const numbers = data as unknown as GroupNumbers;
    const site = numbers.sites.find((s) => s.id === siteId)!;
    expect(site.substitutions).toBe(0);
    expect(site.trials).toBe(0);
    expect(site.last_recorded).toBeNull();
    expect(typeof site.added).toBe("string");
    expect(site.added.length).toBeGreaterThan(0);
  });

  it("a site that has recorded a substitution reports when", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "Substitution Group");
    const siteId = await newSite(owner.client, orgId, "Bridge Street");
    const dishId = await newDish(owner.client, orgId, "Soup");
    await kitchen(owner.client).rpc("record_deviation", {
      p_dish: dishId,
      p_site: siteId,
      p_note: "less salt",
    });

    const { data, error } = await kitchen(owner.client).rpc("group_numbers", { p_org: orgId });
    expect(error).toBeNull();
    const numbers = data as unknown as GroupNumbers;
    const site = numbers.sites.find((s) => s.id === siteId)!;
    expect(site.substitutions).toBe(1);
    expect(site.last_recorded).not.toBeNull();
  });

  it("my_group_numbers returns a key per group the caller runs", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const firstOrg = await newOrg(owner.client, "First Numbers Group");
    const secondOrg = await newOrg(owner.client, "Second Numbers Group");
    await newDish(owner.client, firstOrg, "Soup");
    await newDish(owner.client, secondOrg, "Stew");

    const { data, error } = await kitchen(owner.client).rpc("my_group_numbers");
    expect(error).toBeNull();
    const strip = data as unknown as Record<string, StripNumbers>;
    expect(Object.keys(strip).length).toBe(2);
    expect(Object.keys(strip)).toContain(firstOrg);
    expect(Object.keys(strip)).toContain(secondOrg);
  });

  it("my_group_numbers is empty for somebody who runs nothing", async () => {
    const fresh = await makeUser(`kit-num-fresh-${stamp()}@t.dev`);

    const { data, error } = await kitchen(fresh.client).rpc("my_group_numbers");
    expect(error).toBeNull();
    expect(data).toEqual({});
  });
});

// Today as a local YYYY-MM-DD string. Never toISOString(): that converts to UTC first, so for
// anybody east or west of Greenwich it names the wrong day for part of every day.
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

type PersonRow = {
  user_id: string;
  display_name: string;
  role: string;
  site_name: string | null;
  days_back: number;
  of_days: number;
  last_seen: string | null;
  never: boolean;
};

type People = {
  staff: PersonRow[];
  invites: { issued: number; used: number; open: number; aged_out: number };
  closed_sites: number;
  retired_dishes: number;
};

async function recordVisit(who: Client, orgId: string, surface: string) {
  await kitchen(who).rpc("record_kitchen_visit", {
    p_org: orgId,
    p_day: today,
    p_surface: surface,
  });
}

// The DATABASE's date, read back from a server-side default rather than taken from this
// machine's clock. The defect below IS the two clocks disagreeing, so a test that derives its
// dates from `today` above cannot see it: it only fails on a machine that happens to be skewed,
// which is how the original sat green all morning and red every evening. kitchen.orgs.created_at
// is `default now()` (0039) and the database runs in UTC, so its UTC date is `current_date`.
async function dbToday(orgId: string) {
  const { data } = await admin
    .schema("kitchen")
    .from("orgs")
    .select("created_at")
    .eq("id", orgId)
    .single();
  return new Date((data as { created_at: string }).created_at).toISOString().slice(0, 10);
}

// The day before that, which is what a client west of UTC stamps on a visit it makes in its
// own evening. Admin is used for the clock only; every assertion below still goes through the
// owner's own client, because the service role bypasses RLS and would pass whatever the
// function did.
async function dbYesterday(orgId: string) {
  const d = new Date(`${await dbToday(orgId)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function people(owner: Client, orgId: string) {
  const { data, error } = await kitchen(owner).rpc("group_people", { p_org: orgId });
  expect(error).toBeNull();
  return data as unknown as People;
}

describe("who comes back", () => {
  it("an owner sees a row per current staff member", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "People Group");
    const siteId = await newSite(owner.client, orgId, "Bridge Street");
    await joinAs(owner.client, orgId, "cook", siteId);

    const data = await people(owner.client, orgId);
    expect(data.staff.length).toBe(2);
    const names = data.staff.map((row) => row.display_name);
    expect(names).toContain("Sam");
    expect(names).toContain("Ruth");
  });

  it("a chef gets an empty object from group_people", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "Chef People Group");
    const chef = await joinAs(owner.client, orgId, "chef", null);

    const { data, error } = await kitchen(chef.client).rpc("group_people", { p_org: orgId });
    expect(error).toBeNull();
    expect(data).toEqual({});
  });

  it("a cook gets an empty object from group_people", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "Cook People Group");
    const siteId = await newSite(owner.client, orgId, "Bridge Street");
    const cook = await joinAs(owner.client, orgId, "cook", siteId);

    const { data, error } = await kitchen(cook.client).rpc("group_people", { p_org: orgId });
    expect(error).toBeNull();
    expect(data).toEqual({});
  });

  it("a stranger gets an empty object from group_people", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "Stranger People Group");
    const stranger = await makeUser(`kit-num-stranger-${stamp()}@t.dev`);

    const { data, error } = await kitchen(stranger.client).rpc("group_people", { p_org: orgId });
    expect(error).toBeNull();
    expect(data).toEqual({});
  });

  it("somebody who joined three days ago is counted out of three", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "New Hire Group");
    const siteId = await newSite(owner.client, orgId, "Bridge Street");
    const cook = await joinAs(owner.client, orgId, "cook", siteId);

    await admin
      .schema("kitchen")
      .from("staff")
      .update({ joined_at: new Date(Date.now() - 3 * 86400000).toISOString() })
      .eq("org_id", orgId)
      .eq("user_id", cook.id);

    const data = await people(owner.client, orgId);
    const row = data.staff.find((r) => r.user_id === cook.id)!;
    // The denominator is days since joining rather than a flat seven, so a new hire does not
    // read as four days absent.
    expect(row.of_days).toBe(3);
  });

  it("somebody who never opened it is never, not zero of seven", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "Never Opened Group");
    const siteId = await newSite(owner.client, orgId, "Bridge Street");
    const cook = await joinAs(owner.client, orgId, "cook", siteId);

    const data = await people(owner.client, orgId);
    const row = data.staff.find((r) => r.user_id === cook.id)!;
    // "Never arrived" and "stopped coming" are different facts, so this is a flag and not a
    // large number of days.
    expect(row.never).toBe(true);
    expect(row.days_back).toBe(0);
    expect(row.last_seen).toBeNull();
  });

  it("a visit today counts once however many surfaces were opened", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "Two Surface People Group");
    await recordVisit(owner.client, orgId, "dishes");
    await recordVisit(owner.client, orgId, "sites");

    const data = await people(owner.client, orgId);
    const row = data.staff.find((r) => r.user_id === owner.id)!;
    // The figure counts DAYS and not visits, so two surfaces on one day is still one day back.
    expect(row.days_back).toBe(1);
  });

  it("a visit stamped the client's local yesterday still counts as arriving", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "Skewed Clock Group");

    // The writer accepts a day either side on purpose (0064), because the column holds the
    // CLIENT's local date and real offsets span UTC-12 to UTC+14. This is the row an owner in
    // New York creates at nine in the evening, and before 0067 the read window dropped it: the
    // person had arrived on their first day and was reported as never having come.
    await kitchen(owner.client).rpc("record_kitchen_visit", {
      p_org: orgId,
      p_day: await dbYesterday(orgId),
      p_surface: "dishes",
    });

    const data = await people(owner.client, orgId);
    const row = data.staff.find((r) => r.user_id === owner.id)!;
    expect(row.never).toBe(false);
    // Still a fraction that can be read: the window is a day wider than its denominator, so
    // the count is clamped rather than reporting 2 of 1.
    expect(row.of_days).toBe(1);
    expect(row.days_back).toBe(1);
  });

  it("attendance in another group is not counted here", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const firstOrg = await newOrg(owner.client, "First People Group");
    const secondOrg = await newOrg(owner.client, "Second People Group");
    await recordVisit(owner.client, secondOrg, "dishes");

    const data = await people(owner.client, firstOrg);
    const row = data.staff.find((r) => r.user_id === owner.id)!;
    // This is what org_id in the primary key buys: a day worked for one employer is not a day
    // worked for another, so the other group's visit is invisible here.
    expect(row.days_back).toBe(0);
    expect(row.never).toBe(true);
  });

  it("a removed staff member is not listed", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "Removed People Group");
    const siteId = await newSite(owner.client, orgId, "Bridge Street");
    const cook = await joinAs(owner.client, orgId, "cook", siteId);
    await recordVisit(cook.client, orgId, "dishes");

    await admin
      .schema("kitchen")
      .from("staff")
      .delete()
      .eq("org_id", orgId)
      .eq("user_id", cook.id);

    const data = await people(owner.client, orgId);
    expect(data.staff.some((r) => r.user_id === cook.id)).toBe(false);
  });

  it("an open invite and an aged-out one are counted apart", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "Invite People Group");
    const siteId = await newSite(owner.client, orgId, "Bridge Street");

    const { data: firstCode } = await kitchen(owner.client).rpc("create_invite", {
      p_org: orgId,
      p_role: "cook",
      p_site: siteId,
    });
    await kitchen(owner.client).rpc("create_invite", {
      p_org: orgId,
      p_role: "cook",
      p_site: siteId,
    });

    await admin
      .schema("kitchen")
      .from("staff_invites")
      .update({ expires_at: new Date(Date.now() - 86400000).toISOString() })
      .eq("code", firstCode);

    const data = await people(owner.client, orgId);
    // An invite carries its own expires_at, so an aged-out invite is one with used_at null and
    // expires_at in the past, and an open one is used_at null with expires_at still ahead.
    expect(data.invites.open).toBe(1);
    expect(data.invites.aged_out).toBe(1);
  });

  it("a closed site and a retired dish are counted", async () => {
    const owner = await makeUser(`kit-num-owner-${stamp()}@t.dev`);
    const orgId = await newOrg(owner.client, "Closed People Group");
    const siteId = await newSite(owner.client, orgId, "Bridge Street");
    const dishId = await newDish(owner.client, orgId, "Soup");

    await kitchen(owner.client).rpc("close_site", { p_site: siteId });
    await kitchen(owner.client).rpc("retire_dish", { p_dish: dishId });

    const data = await people(owner.client, orgId);
    expect(data.closed_sites).toBe(1);
    expect(data.retired_dishes).toBe(1);
  });
});
