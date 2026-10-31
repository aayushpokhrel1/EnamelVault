import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import RecipeCreate from "./RecipeCreate";

// Mutable so a test can render the page with no family. The default is the signed-in cook who
// already has a kitchen, which is what the other tests in this file assume.
let activeFamily: { id: string; name: string; invite_code: string; created_by: string } | null = {
  id: "f1", name: "F", invite_code: "x", created_by: "u",
};

vi.mock("../context/FamilyContext", () => ({
  useFamily: () => ({ activeFamily }),
}));

vi.mock("../lib/api/drafts", () => ({
  listDrafts: vi.fn().mockResolvedValue([]),
  getDraft: vi.fn(),
  saveDraft: vi.fn().mockResolvedValue("d1"),
  deleteDraft: vi.fn().mockResolvedValue(undefined),
}));

test("renders the guided create form", () => {
  render(
    <MemoryRouter>
      <RecipeCreate />
    </MemoryRouter>,
  );
  expect(screen.getByRole("button", { name: /add ingredient/i })).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/title/i)).toBeInTheDocument();
});

// The defect: with no family, handleSubmit returned silently while Save stayed enabled and
// looked exactly as it does when it works. The reason has to be beside the button, because
// the notice at the top of a long form is off screen by the time anyone reaches Save.
test("with no active family the Save button is disabled and says why", () => {
  activeFamily = null;
  render(
    <MemoryRouter>
      <RecipeCreate />
    </MemoryRouter>,
  );

  expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  expect(screen.getByText(/setting up your kitchen/i)).toBeInTheDocument();
  activeFamily = { id: "f1", name: "F", invite_code: "x", created_by: "u" };
});

// Same shape of bug as the Save button above, one control over: a disabled Save draft with
// its reason off screen is a silent failure in a different costume. The reason has to be
// visible beside the button, and the button has to come alive once a title exists.
test("Save draft is disabled without a title and says why, enabled with one", () => {
  render(
    <MemoryRouter>
      <RecipeCreate />
    </MemoryRouter>,
  );

  const saveDraftButton = screen.getByRole("button", { name: /save draft/i });
  expect(saveDraftButton).toBeDisabled();
  expect(screen.getByText(/a draft needs a title/i)).toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText(/title/i), { target: { value: "Sunday sauce" } });

  expect(screen.getByRole("button", { name: /save draft/i })).toBeEnabled();
  expect(screen.queryByText(/a draft needs a title/i)).not.toBeInTheDocument();
});

// The bug Aayush hit: dictate steps, watch them appear in the box, save, and the spoken steps
// are gone while the ingredients the same call found are kept.
//
// StepEditor calls onChange (steps) and onIngredientsFound in the SAME tick. React batches the
// two setDraft calls, and both used to spread `draft` from the render closure, so the second one
// wrote back the steps from BEFORE the first. Nothing looked wrong on screen, because StepEditor
// owns its own text; the loss existed only in the parent and only surfaced on save.
//
// Driven through Tidy rather than the mic, because Tidy takes the identical path (one
// extractRecipe call, then onChange and onIngredientsFound together) and is unambiguous to
// click. Mocking useRecorder here would hook the wrong component: AiPrefillPanel uses it too,
// and it renders FIRST. The mic's own hazard, a stale text closure, is pinned in
// StepEditor.test.tsx.
test("model steps survive a save that also fills in ingredients", async () => {
  const createRecipe = vi.fn().mockResolvedValue({ id: "r1" });
  vi.doMock("../lib/api/recipes", () => ({
    createRecipe,
    listFamilyIngredientNames: vi.fn().mockResolvedValue([]),
    listFamilySectionNames: vi.fn().mockResolvedValue([]),
  }));
  vi.doMock("../lib/api/tags", () => ({ setRecipeTags: vi.fn(), listTags: vi.fn().mockResolvedValue([]) }));
  vi.doMock("../lib/api/extract", () => ({
    extractRecipe: vi.fn().mockResolvedValue({
      title: "", story: "", provenance: "", servings: null, prep_minutes: null, cook_minutes: null,
      source_url: null,
      ingredients: [{ position: 0, quantity: null, unit: null, item: "onion", note: null, section: null }],
      steps: [
        { position: 0, text: "Cook the onion until golden" },
        { position: 1, text: "Simmer for twenty minutes" },
      ],
    }),
  }));

  vi.resetModules();
  const { default: Page } = await import("./RecipeCreate");
  render(<MemoryRouter><Page /></MemoryRouter>);

  fireEvent.change(screen.getByPlaceholderText(/one step per line/i), {
    target: { value: "cook the onion then simmer it for ages" },
  });
  fireEvent.click(screen.getByRole("button", { name: /tidy into steps/i }));
  await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());

  fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
  await waitFor(() => expect(createRecipe).toHaveBeenCalled());

  // Under the bug this was the pre-Tidy line, because the ingredients write clobbered it.
  const draft = createRecipe.mock.calls[0][1];
  expect(draft.steps.map((s: { text: string }) => s.text)).toEqual([
    "Cook the onion until golden",
    "Simmer for twenty minutes",
  ]);
  // And the ingredients must still arrive: the fix must not trade one loss for the other.
  expect(draft.ingredients.map((i: { item: string }) => i.item)).toEqual(["onion"]);
  vi.doUnmock("../lib/api/extract");
  vi.doUnmock("../lib/api/recipes");
  vi.doUnmock("../lib/api/tags");
});

// Reporting is only worth having if it fires on the path where a failure costs someone their
// work. A save that blows up must leave a trace without anybody being asked to describe it.
test("a failed save reports itself once, with the context that says where", async () => {
  const reportError = vi.fn();
  vi.doMock("../lib/api/errorLog", () => ({ reportError }));
  vi.doMock("../lib/api/recipes", () => ({
    createRecipe: vi.fn().mockRejectedValue(new Error("db is on fire")),
    listFamilyIngredientNames: vi.fn().mockResolvedValue([]),
    listFamilySectionNames: vi.fn().mockResolvedValue([]),
  }));
  vi.doMock("../lib/api/tags", () => ({ setRecipeTags: vi.fn(), listTags: vi.fn().mockResolvedValue([]) }));

  vi.resetModules();
  const { default: Page } = await import("./RecipeCreate");
  render(<MemoryRouter><Page /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

  await waitFor(() => expect(reportError).toHaveBeenCalledWith("save:recipe-create", expect.any(Error)));
  expect(reportError).toHaveBeenCalledTimes(1);
  // The person still gets told; reporting is additional, never a replacement.
  expect(await screen.findByText(/db is on fire/i)).toBeInTheDocument();
  vi.doUnmock("../lib/api/errorLog");
  vi.doUnmock("../lib/api/recipes");
  vi.doUnmock("../lib/api/tags");
});

// A SUCCESSFUL EXTRACTION THAT FOUND NOTHING SAID NOTHING.
//
// The function answers 200 with empty ingredients and steps whenever the model reads something
// and finds no recipe in it, which a real URL does often. The panel treated that as success,
// which it is, and showed nothing, which left the cook watching the button go back to "Extract"
// with no idea whether anything had happened. Found by pasting a public wiki page while walking
// the import on 2026-10-31: the reply was {"title":"Pancakes","ingredients":[],"steps":[]}.
test("says so when the assistant read something and found no recipe in it", async () => {
  vi.doMock("../lib/api/recipes", () => ({
    createRecipe: vi.fn(),
    listFamilyIngredientNames: vi.fn().mockResolvedValue([]),
    listFamilySectionNames: vi.fn().mockResolvedValue([]),
  }));
  vi.doMock("../lib/api/tags", () => ({ setRecipeTags: vi.fn(), listTags: vi.fn().mockResolvedValue([]) }));
  vi.doMock("../lib/api/extract", () => ({
    extractRecipe: vi.fn().mockResolvedValue({
      title: "Pancakes", story: "", provenance: "", servings: null,
      prep_minutes: null, cook_minutes: null,
      source_url: "https://example.com/pancakes",
      ingredients: [],
      steps: [],
    }),
  }));

  vi.resetModules();
  const { default: Page } = await import("./RecipeCreate");
  render(<MemoryRouter><Page /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText(/recipe text/i), {
    target: { value: "a page with no recipe on it" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^extract$/i }));

  expect(await screen.findByText(/found no ingredients or steps/i)).toBeInTheDocument();
  // Not an error: what it DID find is kept, and the form is still usable by hand.
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect((screen.getByPlaceholderText(/^Title$/) as HTMLInputElement).value).toBe("Pancakes");
  vi.doUnmock("../lib/api/extract");
  vi.doUnmock("../lib/api/recipes");
  vi.doUnmock("../lib/api/tags");
});
