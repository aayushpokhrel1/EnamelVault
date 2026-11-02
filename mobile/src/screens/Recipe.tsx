import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../src/mobile/theme";
import type { RecipeView } from "../../../src/mobile/recipe";
import { recipeView } from "../../../src/mobile/recipe";
import { useStore } from "../storeContext";

type Loaded = { state: "loading" } | { state: "missing" } | { state: "ready"; view: RecipeView };

export default function Recipe({ id }: { id: string }) {
  const store = useStore();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });

  useEffect(() => {
    let live = true;
    void recipeView(store, id).then((view) => {
      if (live) setLoaded(view ? { state: "ready", view } : { state: "missing" });
    });
    return () => {
      live = false;
    };
  }, [store, id]);

  if (loaded.state === "loading") return <View style={styles.screen} />;

  if (loaded.state === "missing") {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
        <View style={styles.plate}>
          <Text style={styles.title}>Not on this phone</Text>
          {/* Not an error. A recipe this device has not caught up with yet, or one the cook
              no longer has access to, is an ordinary state on a device that syncs. */}
          <Text style={styles.meta}>
            This recipe has not reached this phone, or is no longer shared with you.
          </Text>
        </View>
      </ScrollView>
    );
  }

  const { view } = loaded;
  const minutes = [
    view.prep_minutes !== null ? `${view.prep_minutes} min prep` : null,
    view.cook_minutes !== null ? `${view.cook_minutes} min cooking` : null,
  ].filter(Boolean);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      <View style={styles.plate}>
        <Text style={styles.title}>{view.title}</Text>
        {view.byline !== null && <Text style={styles.meta}>by {view.byline}</Text>}
        {minutes.length > 0 && <Text style={styles.meta}>{minutes.join(" · ")}</Text>}
        {view.servings !== null && <Text style={styles.meta}>Serves {view.servings}</Text>}
        {view.showingLocalEdit && (
          <Text style={styles.note}>Showing your unsent changes</Text>
        )}
        {view.story !== null && <Text style={styles.story}>{view.story}</Text>}
      </View>

      <View style={styles.plate}>
        <Text style={styles.heading}>Ingredients</Text>
        {view.ingredients.map((ingredient) => (
          <Text key={`${ingredient.position}`} style={styles.line}>
            {/* The ONE reserved action colour carries the quantity, which is what a cook
                scans for mid-recipe. DESIGN.md says a second use of it is a design decision;
                this is that use. */}
            {(ingredient.quantity || ingredient.unit) && (
              <Text style={styles.quantity}>
                {[ingredient.quantity, ingredient.unit].filter(Boolean).join(" ")}{" "}
              </Text>
            )}
            {ingredient.item}
            {ingredient.optional ? " (optional)" : ""}
          </Text>
        ))}
      </View>

      <View style={styles.plate}>
        <Text style={styles.heading}>Method</Text>
        {view.steps.map((step) => (
          <View key={`${step.position}`} style={styles.step}>
            <Text style={styles.stepNumber}>{step.position + 1}</Text>
            <Text style={styles.line}>{step.text}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.wall },
  body: { padding: 16 },
  plate: { backgroundColor: COLORS.plate, borderRadius: 14, marginBottom: 12, padding: 16 },
  title: { color: COLORS.ink, fontSize: 26, fontWeight: "700" },
  heading: { color: COLORS.ink, fontSize: 20, fontWeight: "700", marginBottom: 8 },
  meta: { color: COLORS.inkSoft, fontSize: 15, marginTop: 2 },
  note: { color: COLORS.chipInk, fontSize: 15, fontWeight: "600", marginTop: 8 },
  story: { color: COLORS.ink, fontSize: 17, marginTop: 10 },
  line: { color: COLORS.ink, flexShrink: 1, fontSize: 17, marginBottom: 6 },
  quantity: { color: COLORS.action, fontWeight: "700" },
  step: { flexDirection: "row", gap: 10, marginBottom: 8 },
  stepNumber: { color: COLORS.inkSoft, fontSize: 17, fontWeight: "700", minWidth: 20 },
});
