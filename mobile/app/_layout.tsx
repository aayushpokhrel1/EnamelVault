import { createContext, useContext } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { COLORS } from "../../src/mobile/theme";
import type { Store } from "../../src/mobile/store/types";
import Gate from "../src/screens/Gate";

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
  return (
    <>
      <StatusBar style="light" />
      {/* <Stack> appears HERE AND NOWHERE ELSE, and only as a child of <Gate>. That is the
          whole router guard, and supabase/mobile_seal.test.ts fails if either half stops
          being true. A route file cannot escape a gate it is never rendered outside of. */}
      <Gate>
        {(store) => (
          <StoreContext.Provider value={store}>
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
      </Gate>
    </>
  );
}
