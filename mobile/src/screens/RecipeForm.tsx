import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import type { Visibility } from "../../../src/lib/api/types";
import { COLORS } from "../../../src/mobile/theme";
import type { DraftPayload } from "../../../src/mobile/sync/outbox";
import { queueCreate, queueEdit, recipeView } from "../../../src/mobile/recipe";
import type { Family } from "../../../src/mobile/sync/catchup";
import { myFamilies } from "../../../src/mobile/sync/catchup";
import { useStore } from "../storeContext";

const VISIBILITIES: { value: Visibility; says: string }[] = [
  { value: "private", says: "Just me" },
  { value: "family", says: "My family" },
  { value: "public", says: "Anyone" },
];

const minutes = (value: string): number | null => {
  const parsed = Number(value.trim());
  // An empty box means "not stated", which is not the same as zero: a recipe that claims 0
  // minutes of cooking is making a claim, and a blank one is not.
  return value.trim() === "" || !Number.isFinite(parsed) || parsed < 0 ? null : Math.round(parsed);
};

type Lines = { ingredients: string; steps: string };

/**
 * Ingredients and steps are one text box each, a line per entry. Deliberate for the first
 * release: a drag-to-reorder list of structured rows is the biggest piece of UI in the whole
 * app, and nothing about it can be tested without a simulator. A cook can type, which is
 * what being on a phone in a kitchen is for.
 */
const toPayload = (
  familyId: string,
  title: string,
  prep: string,
  cook: string,
  visibility: Visibility,
  lines: Lines,
): DraftPayload => ({
  family_id: familyId,
  title: title.trim(),
  prep_minutes: minutes(prep),
  cook_minutes: minutes(cook),
  visibility,
  ingredients: lines.ingredients
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((item, position) => ({ position, quantity: null, unit: null, item })),
  steps: lines.steps
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((text, position) => ({ position, text })),
});

export default function RecipeForm({ recipeId }: { recipeId?: string }) {
  const store = useStore();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [prep, setPrep] = useState("");
  const [cook, setCook] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("family");
  const [lines, setLines] = useState<Lines>({ ingredients: "", steps: "" });
  const [family, setFamily] = useState("");
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(recipeId !== undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void myFamilies(store).then((mine) => {
      setFamilies(mine);
      // One family is the ordinary case, so it is chosen rather than asked about. A picker
      // with a single option is a question with one answer.
      if (mine.length === 1) setFamily((held) => (held === "" ? mine[0].id : held));
    });
  }, [store]);

  useEffect(() => {
    if (recipeId === undefined) return;
    void recipeView(store, recipeId).then(async (view) => {
      if (!view) {
        setError("That recipe is not on this phone.");
        setLoading(false);
        return;
      }
      setTitle(view.title);
      setPrep(view.prep_minutes === null ? "" : String(view.prep_minutes));
      setCook(view.cook_minutes === null ? "" : String(view.cook_minutes));
      setVisibility(view.visibility);
      setLines({
        ingredients: view.ingredients
          .map((i) => [i.quantity, i.unit, i.item].filter(Boolean).join(" "))
          .join("\n"),
        steps: view.steps.map((s) => s.text).join("\n"),
      });
      const row = await store.get("recipes", recipeId);
      setFamily(String(row?.family_id ?? ""));
      setLoading(false);
    });
  }, [store, recipeId]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = toPayload(family, title, prep, cook, visibility, lines);
      if (recipeId === undefined) {
        const id = await queueCreate(store, payload);
        router.replace(`/recipe/${encodeURIComponent(id)}`);
      } else {
        await queueEdit(store, recipeId, payload);
        router.back();
      }
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
      setBusy(false);
    }
  };

  if (loading) return <View style={styles.screen} />;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.plate}>
          {/* Said before the save, not after: this is the whole promise of the app, and a
              cook who does not know their work is kept will not type on a train. */}
          <Text style={styles.note}>Saved on this phone straight away, and sent when there is signal.</Text>

          <Text style={styles.label} nativeID="title-label">
            Title
          </Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            accessibilityLabel="Title"
            accessibilityLabelledBy="title-label"
            editable={!busy}
          />

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.label} nativeID="prep-label">
                Prep, minutes
              </Text>
              <TextInput
                style={styles.input}
                value={prep}
                onChangeText={setPrep}
                accessibilityLabel="Prep, minutes"
                accessibilityLabelledBy="prep-label"
                keyboardType="number-pad"
                editable={!busy}
              />
            </View>
            <View style={styles.half}>
              <Text style={styles.label} nativeID="cook-label">
                Cooking, minutes
              </Text>
              <TextInput
                style={styles.input}
                value={cook}
                onChangeText={setCook}
                accessibilityLabel="Cooking, minutes"
                accessibilityLabelledBy="cook-label"
                keyboardType="number-pad"
                editable={!busy}
              />
            </View>
          </View>

          {recipeId === undefined && families.length > 1 && (
            <>
              <Text style={styles.label}>Which family</Text>
              <View style={styles.row}>
                {families.map((option) => (
                  <Pressable
                    key={option.id}
                    style={[styles.chip, family === option.id && styles.chipOn]}
                    onPress={() => setFamily(option.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: family === option.id }}
                    accessibilityLabel={option.name}
                  >
                    <Text style={family === option.id ? styles.chipOnText : styles.chipText}>{option.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {recipeId === undefined && families.length === 0 && (
            <Text style={styles.error}>
              {/* Honest rather than a disabled button with no reason beside it. */}
              This phone has not caught up with your families yet, so there is nowhere to file
              a new recipe. Pull down on the shelf once you have signal.
            </Text>
          )}

          <Text style={styles.label}>Who can see it</Text>
          <View style={styles.row}>
            {VISIBILITIES.map((option) => (
              <Pressable
                key={option.value}
                style={[styles.chip, visibility === option.value && styles.chipOn]}
                onPress={() => setVisibility(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: visibility === option.value }}
                accessibilityLabel={option.says}
              >
                <Text style={visibility === option.value ? styles.chipOnText : styles.chipText}>{option.says}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.plate}>
          <Text style={styles.label} nativeID="ingredients-label">
            Ingredients, one per line
          </Text>
          <TextInput
            style={[styles.input, styles.tall]}
            value={lines.ingredients}
            onChangeText={(value) => setLines((held) => ({ ...held, ingredients: value }))}
            accessibilityLabel="Ingredients, one per line"
            accessibilityLabelledBy="ingredients-label"
            multiline
            editable={!busy}
          />
        </View>

        <View style={styles.plate}>
          <Text style={styles.label} nativeID="steps-label">
            Method, one step per line
          </Text>
          <TextInput
            style={[styles.input, styles.tall]}
            value={lines.steps}
            onChangeText={(value) => setLines((held) => ({ ...held, steps: value }))}
            accessibilityLabel="Method, one step per line"
            accessibilityLabelledBy="steps-label"
            multiline
            editable={!busy}
          />
        </View>

        {error !== null && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}

        <Pressable
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          onPress={() => void save()}
          disabled={busy || title.trim() === "" || family === ""}
          accessibilityRole="button"
        >
          <Text style={styles.actionText}>{recipeId === undefined ? "Add it" : "Save the change"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.wall },
  body: { padding: 16 },
  plate: { backgroundColor: COLORS.plate, borderRadius: 14, marginBottom: 12, padding: 16 },
  note: { color: COLORS.inkSoft, fontSize: 15, marginBottom: 12 },
  label: { color: COLORS.ink, fontSize: 15, fontWeight: "600", marginBottom: 4 },
  input: {
    backgroundColor: COLORS.plateAlt,
    borderRadius: 10,
    color: COLORS.ink,
    fontSize: 17,
    marginBottom: 12,
    padding: 12,
  },
  tall: { minHeight: 140, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  chip: { backgroundColor: COLORS.plateAlt, borderRadius: 999, marginBottom: 4, minHeight: 44, justifyContent: "center", paddingHorizontal: 14 },
  chipOn: { backgroundColor: COLORS.chip },
  chipText: { color: COLORS.inkSoft, fontSize: 15 },
  chipOnText: { color: COLORS.chipInk, fontSize: 15, fontWeight: "700" },
  error: { color: COLORS.actionDeep, fontSize: 15, fontWeight: "600", marginBottom: 12 },
  action: {
    alignItems: "center",
    backgroundColor: COLORS.action,
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 48,
    padding: 12,
  },
  actionText: { color: COLORS.onAction, fontSize: 17, fontWeight: "700" },
  pressed: { opacity: 0.85 },
});
