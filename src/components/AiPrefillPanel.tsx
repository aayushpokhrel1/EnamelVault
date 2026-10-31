import { useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { extractRecipe } from "../lib/api/extract";
import { reportError } from "../lib/api/errorLog";
import type { RecipeDraft } from "../lib/api/types";
import { blobToBase64, useRecorder } from "../lib/useRecorder";

// Image needs a vision MODEL_NAME; audio needs the edge function's TRANSCRIBE_*
// (Groq Whisper) configured. Both fail with a clear message otherwise.
type Mode = "text" | "url" | "image" | "audio";

const modes: { mode: Mode; label: string }[] = [
  { mode: "text", label: "Paste / write text" },
  { mode: "url", label: "URL" },
  { mode: "image", label: "Photo" },
  { mode: "audio", label: "Voice" },
];

export default function AiPrefillPanel({ onDraft }: { onDraft: (draft: RecipeDraft) => void }) {
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A SUCCESSFUL EXTRACTION THAT FOUND NOTHING IS NOT AN ERROR, and until 2026-10-31 it was
  // not anything else either. The function answers 200 with a draft whose ingredients and
  // steps are empty whenever the model reads a page and finds no recipe in it, which a real
  // URL does often: a wiki page of prose, a blog post that buries the recipe behind a script,
  // a photo of the wrong side of the card. The cook saw the button go back to "Extract", one
  // field quietly change, and nothing else. Found by pasting a public wiki page while walking
  // the import, where the reply was {"title":"Pancakes","ingredients":[],"steps":[]}.
  //
  // It is NOT an error state: what came back is kept (a title is worth having) and the form is
  // perfectly usable by hand, so this says what happened rather than colouring it red.
  const [thin, setThin] = useState(false);

  async function run(m: Mode, payload: string) {
    setError(null);
    setThin(false);
    setLoading(true);
    try {
      const draft = await extractRecipe(m, payload);
      onDraft(draft);
      setThin(draft.ingredients.length === 0 && draft.steps.length === 0);
    } catch (err) {
      reportError(`extract:${m}`, err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const {
    recording,
    supported: voiceSupported,
    start: handleRecord,
    stop: stopRecording,
    error: recorderError,
  } = useRecorder((base64) => run("audio", base64));

  async function handleSubmit() {
    if (mode === "text") await run("text", text);
    else if (mode === "url") await run("url", url);
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await blobToBase64(file);
      await run("image", base64);
    } catch (err) {
      // Reading the file, not extracting from it: run() swallows its own failures, so this catch
      // only ever sees blobToBase64 rejecting.
      reportError("extract:image-read", err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="plate ai-panel">
      <h2>Prefill with AI</h2>
      {/* The DISCLOSURE, not decoration. src/pages/Privacy.tsx relies on the importer saying
          where content goes BEFORE it is sent: this panel is the only moment a user can decide
          not to, because pressing a button here is what sends their recipe card to another
          company. Keep it above the controls, keep the provider link, and keep the allergen
          line, which the terms also carry: a dropped ingredient is this feature's worst case. */}
      <p className="vault-note">
        What you paste, photograph or record here is sent to an AI provider to be read. Nothing
        is sent until you press the button, and typing a recipe in by hand sends nothing at all.{" "}
        <Link to="/privacy">Who receives it</Link>. Always check the result against the original
        before you cook, especially for allergens.
      </p>
      <div className="tag-row">
        {modes.map((m) => (
          <button
            key={m.mode}
            type="button"
            aria-pressed={mode === m.mode}
            onClick={() => setMode(m.mode)}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === "text" && (
        <label>
          Recipe text
          <textarea value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      )}
      {mode === "url" && (
        <label>
          Recipe URL
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </label>
      )}
      {mode === "image" && (
        <label>
          Photo of a recipe card
          <input type="file" accept="image/*" onChange={handleFile} disabled={loading} />
          {/* Says "recipe card" because the model READS, it does not recognise. A photo of
              the finished dish has no words in it and comes back invented. */}
          <span className="vault-note">
            A recipe card, a cookbook page, a handwritten note. Not the finished dish: this
            reads the writing, it cannot tell what a plate of food contains.
          </span>
        </label>
      )}
      {mode === "audio" && (
        <div>
          {voiceSupported ? (
            <>
              <button type="button" onClick={handleRecord} disabled={loading || recording}>
                Record
              </button>
              <button type="button" onClick={stopRecording} disabled={!recording}>
                Stop
              </button>
            </>
          ) : (
            <p>Voice capture not supported in this browser</p>
          )}
        </div>
      )}
      {(mode === "text" || mode === "url") && (
        <button type="button" onClick={handleSubmit} disabled={loading}>
          Extract
        </button>
      )}
      {recording && <p>Recording… tap Stop when done.</p>}
      {loading && <p>Extracting…</p>}
      {thin && !loading && !error && (
        <p role="status" className="vault-note">
          The assistant read that but found no ingredients or steps in it. Anything it did find
          is below; the rest is yours to type in.
        </p>
      )}
      {(error ?? recorderError) && <p role="alert">{error ?? recorderError}</p>}
    </div>
  );
}
