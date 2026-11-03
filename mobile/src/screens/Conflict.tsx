import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { COLORS } from "../../../src/mobile/theme";
import type { Row } from "../../../src/mobile/store/types";
import type { Conflict as ConflictView } from "../../../src/mobile/sync/conflict";
import { describeConflict } from "../../../src/mobile/sync/conflict";
import type { DraftPayload } from "../../../src/mobile/sync/outbox";
import { intentFrom } from "../../../src/mobile/sync/outbox";
import { resolveConflict } from "../../../src/mobile/sync/replay";
import { useStore } from "../storeContext";
import { remote } from "../sync/remote";

const Version = ({ whose, payload, when }: { whose: string; payload: DraftPayload; when?: string }) => (
  <View style={styles.plate}>
    <Text style={styles.whose}>{whose}</Text>
    {when !== undefined && <Text style={styles.meta}>{new Date(when).toLocaleString()}</Text>}
    <Text style={styles.title}>{payload.title}</Text>
    {payload.ingredients.map((ingredient) => (
      <Text key={`i${ingredient.position}`} style={styles.line}>
        {[ingredient.quantity, ingredient.unit, ingredient.item].filter(Boolean).join(" ")}
      </Text>
    ))}
    {payload.steps.map((step) => (
      <Text key={`s${step.position}`} style={styles.line}>
        {step.position + 1}. {step.text}
      </Text>
    ))}
  </View>
);

export default function Conflict({ intentId }: { intentId: string }) {
  const store = useStore();
  const router = useRouter();
  const [view, setView] = useState<ConflictView | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const row = await store.get<Row>("outbox", intentId);
      if (!row) {
        setGone(true);
        return;
      }
      const intent = intentFrom(row);
      const current = await remote.getRecipe(intent.recipeId);
      if (!current.row) {
        setError(current.error ?? "Could not read the other version. You need signal for this one.");
        return;
      }
      setView(describeConflict(intent, current.row));
    })();
  }, [store, intentId]);

  const choose = useCallback(
    async (keep: "mine" | "theirs") => {
      setBusy(true);
      setError(null);
      const outcome = await resolveConflict(store, remote, intentId, keep);
      if (outcome === "failed") {
        setError("That did not go through. Your version is still here.");
        setBusy(false);
        return;
      }
      router.back();
    },
    [store, intentId, router],
  );

  if (gone) {
    return (
      <View style={styles.screen}>
        <View style={styles.plate}>
          <Text style={styles.title}>Already settled</Text>
          <Text style={styles.meta}>This one has been dealt with.</Text>
        </View>
      </View>
    );
  }

  if (view === null) {
    return (
      <View style={styles.waiting}>
        {error === null ? <ActivityIndicator color={COLORS.onWall} /> : <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      <View style={styles.plate}>
        <Text style={styles.title}>Two versions</Text>
        {/* Said BEFORE the tap, in these words, rather than afterwards in a warning
            triangle. The version not kept is gone, and a person deciding deserves to know
            that while they are deciding. */}
        <Text style={styles.meta}>
          {view.theirsAuthor === null ? "Someone else" : view.theirsAuthor} changed this recipe while your
          edit was waiting. Keeping one throws the other away.
        </Text>
      </View>

      <Version whose="Yours, not yet sent" payload={view.mine} />
      <Version
        whose={view.theirsAuthor === null ? "Theirs, on the server" : `${view.theirsAuthor}'s, on the server`}
        payload={view.theirs}
        when={view.theirsUpdatedAt}
      />

      {error !== null && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}

      <Pressable
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        disabled={busy}
        accessibilityRole="button"
        onPress={() => void choose("mine")}
      >
        <Text style={styles.actionText}>Keep mine, throw theirs away</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        disabled={busy}
        accessibilityRole="button"
        onPress={() => void choose("theirs")}
      >
        <Text style={styles.secondaryText}>Keep theirs, throw mine away</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.wall },
  waiting: { flex: 1, backgroundColor: COLORS.wall, justifyContent: "center", padding: 24 },
  body: { padding: 16 },
  plate: { backgroundColor: COLORS.plate, borderRadius: 14, marginBottom: 12, padding: 16 },
  whose: { color: COLORS.inkSoft, fontSize: 15, fontWeight: "700", marginBottom: 4 },
  title: { color: COLORS.ink, fontSize: 20, fontWeight: "700" },
  meta: { color: COLORS.inkSoft, fontSize: 15, marginTop: 4 },
  line: { color: COLORS.ink, fontSize: 16, marginTop: 4 },
  error: { color: COLORS.actionLit, fontSize: 16, fontWeight: "600", marginBottom: 12 },
  action: {
    alignItems: "center",
    backgroundColor: COLORS.action,
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 48,
    padding: 12,
  },
  actionText: { color: COLORS.onAction, fontSize: 17, fontWeight: "700" },
  secondary: {
    alignItems: "center",
    backgroundColor: COLORS.chip,
    borderRadius: 10,
    justifyContent: "center",
    marginTop: 10,
    minHeight: 48,
    padding: 12,
  },
  secondaryText: { color: COLORS.chipInk, fontSize: 17, fontWeight: "600" },
  pressed: { opacity: 0.85 },
});
