import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { COLORS } from "../../../src/mobile/theme";
import type { RecipeView } from "../../../src/mobile/recipe";
import { recipeView } from "../../../src/mobile/recipe";
import { useStore } from "../storeContext";

const TAG = "cook-mode";

export default function Cook({ id }: { id: string }) {
  const store = useStore();
  const [view, setView] = useState<RecipeView | null>(null);
  const [at, setAt] = useState(0);

  useEffect(() => {
    void recipeView(store, id).then(setView);
  }, [store, id]);

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

  if (view === null) return <View style={styles.screen} />;

  if (view.steps.length === 0) {
    return (
      <View style={styles.screen}>
        <View style={styles.plate}>
          <Text style={styles.step}>This recipe has no method written down.</Text>
        </View>
      </View>
    );
  }

  const step = view.steps[Math.min(at, view.steps.length - 1)];

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
