import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { COLORS } from "../../../src/mobile/theme";
import type { Store } from "../../../src/mobile/store/types";
import { needsTerms } from "../../../src/mobile/terms";
import { useSession } from "../auth/session";
import { acceptTerms, readTermsFacts } from "../terms";
import SignIn from "./SignIn";

const TERMS_URL = "https://recipes.enamelvault.com/terms";

/**
 * THE ONE GATE. Nothing reaches the app's routes except through here: there is no redirect a
 * screen performs on mount, so there is no moment when a route is mounted without an account
 * and no deep link that can arrive before the check has run.
 *
 * `supabase/mobile_seal.test.ts` holds that mechanically, because this repo has already
 * shipped an entire app ungated with the suite green: a guard that covered one of several
 * routers reported success for the app it could not see.
 */
export default function Gate({ children }: { children: (store: Store) => React.ReactNode }) {
  const session = useSession();
  const [terms, setTerms] = useState<"checking" | "needed" | "accepted">("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setTerms("checking");
    setTerms(needsTerms(await readTermsFacts()) ? "needed" : "accepted");
  }, []);

  useEffect(() => {
    if (session.status === "signedIn") void check();
    else setTerms("checking");
  }, [session.status, check]);

  if (session.status === "loading" || (session.status === "signedIn" && terms === "checking")) {
    return (
      <View style={styles.waiting}>
        <ActivityIndicator color={COLORS.onWall} />
      </View>
    );
  }

  if (session.status === "signedOut") return <SignIn />;

  if (terms === "needed") {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.plate}>
        <Text style={styles.title}>Before you start</Text>
        <Text style={styles.body}>
          Using Family Recipes means agreeing to the terms. They are short, and you can read them
          now: this is a notice, not a formality after the fact.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)}
          accessibilityRole="button"
        >
          {/* The LIVE page, not a copy. A second copy of the terms in this app would need its
              own fingerprint guard and would drift from the one the acceptance is recorded
              against, which is the only evidence of what anybody agreed to. */}
          <Text style={styles.secondaryText}>Read the terms</Text>
        </Pressable>
        {error !== null && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <Pressable
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          disabled={busy}
          accessibilityRole="button"
          onPress={() => {
            setBusy(true);
            setError(null);
            void acceptTerms().then(async (result) => {
              // Accepting needs the network, so it can fail. Saying so and staying put is the
              // honest outcome: a gate that opened on a failed write would record nothing and
              // claim consent that was never stored.
              if (result.error) setError(result.error);
              else await check();
              setBusy(false);
            });
          }}
        >
          {busy ? <ActivityIndicator color={COLORS.onAction} /> : <Text style={styles.actionText}>I agree</Text>}
        </Pressable>
      </ScrollView>
    );
  }

  return <>{children(session.store)}</>;
}

const styles = StyleSheet.create({
  waiting: { flex: 1, backgroundColor: COLORS.wall, justifyContent: "center" },
  screen: { flex: 1, backgroundColor: COLORS.wall },
  plate: { backgroundColor: COLORS.plate, borderRadius: 16, margin: 24, marginTop: 80, padding: 20 },
  title: { color: COLORS.ink, fontSize: 28, fontWeight: "700", marginBottom: 6 },
  body: { color: COLORS.inkSoft, fontSize: 17, marginBottom: 16 },
  error: { color: COLORS.actionDeep, fontSize: 15, fontWeight: "600", marginTop: 12 },
  action: {
    alignItems: "center",
    backgroundColor: COLORS.action,
    borderRadius: 10,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 48,
    padding: 12,
  },
  actionText: { color: COLORS.onAction, fontSize: 17, fontWeight: "700" },
  pressed: { opacity: 0.85 },
  secondary: {
    alignItems: "center",
    backgroundColor: COLORS.chip,
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 48,
    padding: 12,
  },
  secondaryText: { color: COLORS.chipInk, fontSize: 17, fontWeight: "600" },
});
