import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { COLORS } from "../../src/mobile/theme";

// The enamel wall from DESIGN.md carries every screen; the plates carry the content. The
// tokens live in src/mobile/theme.ts so no screen owns a hex literal.

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.wallDeep },
          headerTintColor: COLORS.onWall,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: COLORS.wall },
        }}
      />
    </>
  );
}
