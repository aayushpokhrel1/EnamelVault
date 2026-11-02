import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { COLORS } from "../../src/mobile/theme";
import { StoreProvider } from "../src/storeContext";
import Gate from "../src/screens/Gate";

// The enamel wall from DESIGN.md carries every screen; the plates carry the content. The
// tokens live in src/mobile/theme.ts so no screen owns a hex literal.

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      {/* The router appears HERE AND NOWHERE ELSE, and only as a child of the gate. That is
          the whole router guard, and supabase/mobile_seal.test.ts fails if either half stops
          being true. A route file cannot escape a gate it is never rendered outside of. */}
      <Gate>
        {(store) => (
          <StoreProvider store={store}>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: COLORS.wallDeep },
                headerTintColor: COLORS.onWall,
                headerTitleStyle: { fontWeight: "700" },
                contentStyle: { backgroundColor: COLORS.wall },
              }}
            />
          </StoreProvider>
        )}
      </Gate>
    </>
  );
}
