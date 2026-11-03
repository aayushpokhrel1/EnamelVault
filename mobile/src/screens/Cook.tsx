import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { COLORS } from "../../../src/mobile/theme";
import type { RecipeView } from "../../../src/mobile/recipe";
import { recipeView } from "../../../src/mobile/recipe";
import type { RunningTimer } from "../../../src/mobile/timers";
import { allTimers, cancelTimer, rescheduleAll, startTimer, timersInStep } from "../../../src/mobile/timers";
import { notifier } from "../timers/notify";
import { useStore } from "../storeContext";

const TAG = "cook-mode";

const clock = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const parts = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
  return (parts[0] > 0 ? parts : parts.slice(1))
    .map((part, at) => (at === 0 ? String(part) : String(part).padStart(2, "0")))
    .join(":");
};

export default function Cook({ id }: { id: string }) {
  const store = useStore();
  const [view, setView] = useState<RecipeView | null>(null);
  const [at, setAt] = useState(0);
  const [timers, setTimers] = useState<RunningTimer[]>([]);
  // Display only. The timer itself is an end time in the database, so this ticking has no
  // bearing on whether anything rings: killing the app stops the tick and not the timer.
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setTimers((await allTimers(store)).filter((timer) => timer.recipeId === id));
  }, [store, id]);

  useEffect(() => {
    void recipeView(store, id).then(setView);
  }, [store, id]);

  useEffect(() => {
    // Every arrival re-arms, because iOS drops pending notifications in cases the app does
    // not control and there is no way to ask it which ones are still there.
    void rescheduleAll(store, notifier, new Date()).then(refresh);
  }, [store, refresh]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    // Hands are covered in flour and the phone is on the counter. A screen that sleeps every
    // thirty seconds is the single thing that makes a recipe app useless in a kitchen.
    void activateKeepAwakeAsync(TAG);
    return () => {
      // Not `return deactivateKeepAwake(TAG)`: it is async, and React would be handed a
      // promise where it expects a cleanup function. The screen would keep the phone awake
      // after the cook left it.
      void deactivateKeepAwake(TAG);
    };
  }, []);

  const step = view !== null && view.steps.length > 0 ? view.steps[Math.min(at, view.steps.length - 1)] : null;
  const offered = useMemo(() => (step === null ? [] : timersInStep(step.text)), [step]);

  const start = useCallback(
    async (label: string, seconds: number) => {
      await startTimer(store, id, label, seconds, new Date()).then(notifier.schedule);
      await refresh();
    },
    [store, id, refresh],
  );

  const stop = useCallback(
    async (timerId: string) => {
      await cancelTimer(store, notifier, timerId);
      await refresh();
    },
    [store, refresh],
  );

  if (view === null) return <View style={styles.screen} />;

  if (step === null) {
    return (
      <View style={styles.screen}>
        <View style={styles.plate}>
          <Text style={styles.step}>This recipe has no method written down.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.counter}>
          Step {step.position + 1} of {view.steps.length}
        </Text>
        <View style={styles.plate}>
          {/* The display size DESIGN.md sets for cook mode. A step you have to pick up the
              phone to read is a step you stop reading. */}
          <Text style={styles.step}>{step.text}</Text>
        </View>

        {offered.length > 0 && (
          <View style={styles.plate}>
            <Text style={styles.heading}>Set a timer</Text>
            {offered.map((timer) => (
              <Pressable
                key={timer.matchIndex}
                style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Start a timer for ${timer.label}`}
                onPress={() => void start(timer.label, timer.seconds)}
              >
                <Text style={styles.chipText}>{timer.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {timers.length > 0 && (
          <View style={styles.plate}>
            <Text style={styles.heading}>Running</Text>
            {timers.map((timer) => {
              const left = new Date(timer.endsAt).getTime() - now;
              return (
                <Pressable
                  key={timer.id}
                  style={({ pressed }) => [styles.running, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Stop the timer for ${timer.label}`}
                  onPress={() => void stop(timer.id)}
                >
                  <Text style={styles.runningLabel}>{timer.label}</Text>
                  {/* A finished timer stays on screen saying so until the cook clears it.
                      One that removed itself would leave a person who missed the sound with
                      no way to tell whether it ever ran. */}
                  <Text style={left <= 0 ? styles.done : styles.left}>
                    {left <= 0 ? "Done" : clock(left)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {at === 0 && view.ingredients.length > 0 && (
          <View style={styles.plate}>
            <Text style={styles.heading}>Ingredients</Text>
            {view.ingredients.map((ingredient) => (
              <Text key={ingredient.position} style={styles.line}>
                {[ingredient.quantity, ingredient.unit, ingredient.item].filter(Boolean).join(" ")}
                {ingredient.optional ? " (optional)" : ""}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>
      <View style={styles.bar}>
        <Pressable
          style={({ pressed }) => [styles.move, pressed && styles.pressed, at === 0 && styles.spent]}
          disabled={at === 0}
          accessibilityRole="button"
          accessibilityLabel="Previous step"
          onPress={() => setAt((held) => Math.max(0, held - 1))}
        >
          <Text style={styles.moveText}>Back</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.move,
            styles.next,
            pressed && styles.pressed,
            at >= view.steps.length - 1 && styles.spent,
          ]}
          disabled={at >= view.steps.length - 1}
          accessibilityRole="button"
          accessibilityLabel="Next step"
          onPress={() => setAt((held) => Math.min(view.steps.length - 1, held + 1))}
        >
          <Text style={styles.nextText}>Next</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.wall },
  body: { padding: 16 },
  counter: { color: COLORS.onWall, fontSize: 15, marginBottom: 10, opacity: 0.8 },
  plate: { backgroundColor: COLORS.plate, borderRadius: 14, marginBottom: 12, padding: 20 },
  step: { color: COLORS.ink, fontSize: 26, lineHeight: 36 },
  heading: { color: COLORS.ink, fontSize: 18, fontWeight: "700", marginBottom: 6 },
  line: { color: COLORS.inkSoft, fontSize: 17, marginTop: 2 },
  chip: {
    alignItems: "center",
    backgroundColor: COLORS.chip,
    borderRadius: 10,
    justifyContent: "center",
    marginTop: 8,
    minHeight: 52,
  },
  chipText: { color: COLORS.chipInk, fontSize: 18, fontWeight: "700" },
  running: {
    alignItems: "center",
    borderTopColor: COLORS.wall,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 52,
  },
  runningLabel: { color: COLORS.ink, fontSize: 17 },
  left: { color: COLORS.inkSoft, fontSize: 22, fontVariant: ["tabular-nums"], fontWeight: "700" },
  done: { color: COLORS.action, fontSize: 22, fontWeight: "700" },
  bar: { flexDirection: "row", gap: 12, padding: 16 },
  // Big targets, because the hand reaching for them is wet or floury and the phone is
  // propped against something.
  move: {
    alignItems: "center",
    backgroundColor: COLORS.chip,
    borderRadius: 12,
    flex: 1,
    justifyContent: "center",
    minHeight: 64,
  },
  moveText: { color: COLORS.chipInk, fontSize: 19, fontWeight: "700" },
  next: { backgroundColor: COLORS.action },
  nextText: { color: COLORS.onAction, fontSize: 19, fontWeight: "700" },
  spent: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
});
