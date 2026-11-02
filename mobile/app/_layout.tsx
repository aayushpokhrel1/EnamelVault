import { createContext, useContext } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { COLORS } from "../../src/mobile/theme";
import type { Store } from "../../src/mobile/store/types";
import { useSession } from "../src/auth/session";
import SignIn from "../src/screens/SignIn";

// The enamel wall from DESIGN.md carries every screen; the plates carry the content. The
// tokens live in src/mobile/theme.ts so no screen owns a hex literal.

const StoreContext = createContext<Store | null>(null);

/**
 * The signed-in account's local database. Every screen below the gate has one, which is why
 * this throws rather than returning null: a screen that rendered without a store would be a
 * screen outside the account boundary, and the point of the boundary is that there is no
 * such place.
 */
export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore was called outside the signed-in app.");
  return store;
}

export default function RootLayout() {
  const state = useSession();

  return (
    <>
      <StatusBar style="light" />
      {state.status === "loading" && (
        <View style={{ flex: 1, backgroundColor: COLORS.wall, justifyContent: "center" }}>
          <ActivityIndicator color={COLORS.onWall} />
        </View>
      )}
      {/* The ONLY way past this is a session. Not a redirect a screen performs on mount:
          the signed-out app does not render the routes at all, so there is no moment where
          a screen is mounted without an account and no route that can be reached by deep
          link before the check has run. `src/routes.terms.test.ts` exists because the web
          app learned that an action route can escape a gate; this shape leaves nowhere to
          escape to. Task 11 adds the terms gate inside here, with its own guard. */}
      {state.status === "signedOut" && <SignIn />}
      {state.status === "signedIn" && (
        <StoreContext.Provider value={state.store}>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: COLORS.wallDeep },
              headerTintColor: COLORS.onWall,
              headerTitleStyle: { fontWeight: "700" },
              contentStyle: { backgroundColor: COLORS.wall },
            }}
          />
        </StoreContext.Provider>
      )}
    </>
  );
}
