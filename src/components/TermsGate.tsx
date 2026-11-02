import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { acceptTerms, getMyProfile } from "../lib/api/profile";
// Defined in lib/legal.ts, beside the date it has to move with, and re-exported here because
// this is where the web app has always looked for it.
import { TERMS_VERSION } from "../lib/legal";

export { TERMS_VERSION };

// The gate sits AFTER authentication, not on the signup form. A signup checkbox would
// miss Google sign-in, which never touches that form, and would miss every account that
// already exists. One gate covers email signup, Google signup and existing users.
export default function TermsGate({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [returning, setReturning] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getMyProfile()
      .then((profile) => {
        if (!alive) return;
        setReturning(profile.terms_accepted_at !== null);
        setAccepted(
          profile.terms_accepted_at !== null && profile.terms_version === TERMS_VERSION,
        );
      })
      // A profile read failing must not lock someone out of the whole app.
      .catch(() => {
        if (!alive) return;
        setAccepted(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return null;
  if (accepted) return <>{children}</>;

  async function onAccept() {
    setBusy(true);
    try {
      await acceptTerms(TERMS_VERSION);
      setAccepted(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="prose">
      <h1>Before you continue</h1>
      <p>
        {returning
          ? "Our terms have been updated since you last agreed to them. Please read them again."
          : "Please read and accept the terms before you start using Family Recipes."}
      </p>
      <p>
        <Link to="/terms">Read the terms</Link> and the{" "}
        <Link to="/privacy">privacy policy</Link>.
      </p>
      <button type="button" onClick={onAccept} disabled={busy}>
        Accept and continue
      </button>
    </div>
  );
}
