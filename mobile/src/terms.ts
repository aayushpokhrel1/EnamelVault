import { TERMS_VERSION } from "../../src/mobile/terms";
import { supabase } from "./supabase";

export type TermsFacts = { terms_accepted_at: string | null; terms_version: string | null };

/**
 * The two columns the gate decides on, or null when they could not be read. Null is not
 * "accepted": the caller treats an unreadable profile as needing the terms, because the
 * alternative is opening a gate on the strength of a failed request.
 */
export async function readTermsFacts(): Promise<TermsFacts | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("terms_accepted_at, terms_version")
    .maybeSingle();
  if (error || !data) return null;
  return data as TermsFacts;
}

/**
 * Through the RPC, exactly as the web app does. The version is recorded SERVER-side from the
 * value passed here, and `src/lib/api/profile.ts` explains why it is an RPC at all rather
 * than an update: a direct write would let a client claim it accepted a version it was never
 * shown.
 */
export async function acceptTerms(): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("record_terms_acceptance", { p_version: TERMS_VERSION });
  return { error: error ? error.message : null };
}
