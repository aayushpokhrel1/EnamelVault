import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Store } from "../../../src/mobile/store/types";
import { signOutBlocked, storeNameFor } from "../../../src/mobile/account";
import { createSqliteStore } from "../store/sqlite";
import { supabase } from "../supabase";

export type SessionState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; session: Session; store: Store };

/**
 * The account boundary. A store is opened for the signed-in user and for nobody else, so one
 * cook's recipes are not in a database the next cook's session can open: there is no RLS on
 * the device, and a shared local database would make a second account on one phone a reader
 * of the first one's family.
 */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    let current: string | null = null;
    let live = true;

    const apply = async (session: Session | null) => {
      if (!live) return;
      if (!session) {
        current = null;
        setState({ status: "signedOut" });
        return;
      }
      // Only reopen when the ACCOUNT changed. A token refresh fires the same event and
      // reopening the database on every refresh would throw away whatever is reading it.
      if (session.user.id === current) {
        setState((previous) =>
          previous.status === "signedIn" ? { ...previous, session } : previous,
        );
        return;
      }
      current = session.user.id;
      const store = await createSqliteStore(storeNameFor(session.user.id));
      if (live) setState({ status: "signedIn", session, store });
    };

    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => void apply(session));
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}

/**
 * Signing out is refused while the outbox holds unsent work, because that work lives in this
 * account's database and the cook would have no way back to it. The screen offers to wait
 * for a connection instead; it is not a confirmation dialog, because "are you sure" in front
 * of silent data loss is not a choice anyone can make well.
 */
export async function signOut(store: Store): Promise<{ blocked: boolean }> {
  if (await signOutBlocked(store)) return { blocked: true };
  await supabase.auth.signOut();
  return { blocked: false };
}
