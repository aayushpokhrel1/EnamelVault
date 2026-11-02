import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";
import { chunkedStorage } from "../../src/mobile/chunkedStorage";
import type { KeyValue } from "../../src/mobile/chunkedStorage";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Refused at startup rather than at the first request. A client built on a placeholder fails
// later, inside a query, where it reads as a server problem and sends you looking at RLS.
if (!url || !key || key === "PASTE_PUBLISHABLE_KEY") {
  throw new Error(
    "mobile/.env needs EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY. The key comes from `npx supabase projects api-keys --project-ref ghcclshgdtbystosfzjl`.",
  );
}

// The session lives in the keychain, NOT in the local database. Wiping one account's recipes
// must not be able to take the other account's session with it, and the two have different
// lifetimes: signing out clears the session and leaves the database alone.
const secureStorage: KeyValue = chunkedStorage({
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
});

export const supabase = createClient(url, key, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // There is no URL bar to read a session out of. Native sign-in hands the token to
    // supabase-js directly, and leaving this on makes the client parse deep links it should
    // not touch.
    detectSessionInUrl: false,
  },
});

// Refreshing is a timer, and iOS suspends timers in the background. Without this the token
// expires while the phone is in a pocket and the first request after unlocking fails as
// unauthorised, which looks exactly like being signed out.
AppState.addEventListener("change", (state) => {
  if (state === "active") void supabase.auth.startAutoRefresh();
  else void supabase.auth.stopAutoRefresh();
});
