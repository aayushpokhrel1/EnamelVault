import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../src/mobile/theme";
import { checkSqliteStore } from "../src/store/checkContract";
import type { CaseResult } from "../src/store/checkContract";

// Task 1's deliverable plus Task 8's: proof that the app builds and boots, and proof that the
// SQLite store keeps the same contract the memory store is tested against. The contract can
// only be run here, on the device, because expo-sqlite is native and vitest cannot reach it.
// Task 12 replaces this screen with the shelf, and the check moves behind a dev route.
export default function Index() {
  const [results, setResults] = useState<CaseResult[] | null>(null);
  const [crashed, setCrashed] = useState<string | null>(null);

  useEffect(() => {
    checkSqliteStore().then(setResults, (error: unknown) =>
      setCrashed(error instanceof Error ? error.message : String(error)),
    );
  }, []);

  const failed = results?.filter((result) => !result.ok) ?? [];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.plate}>
        <Text style={styles.title}>Family Recipes</Text>
        {crashed !== null && <Text style={styles.bad}>The store would not open: {crashed}</Text>}
        {results === null && crashed === null && <Text style={styles.body}>Checking the local store…</Text>}
        {results !== null && (
          <Text style={failed.length === 0 ? styles.good : styles.bad}>
            {failed.length === 0
              ? `The local store keeps all ${results.length} of its promises.`
              : `${failed.length} of ${results.length} broken.`}
          </Text>
        )}
        {failed.map((result) => (
          <Text key={result.name} style={styles.body}>
            {result.name}: {result.error}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.wall, justifyContent: "center", padding: 24 },
  plate: { backgroundColor: COLORS.plate, borderRadius: 16, padding: 20 },
  title: { color: COLORS.ink, fontSize: 28, fontWeight: "700", marginBottom: 6 },
  body: { color: COLORS.inkSoft, fontSize: 17, marginTop: 6 },
  good: { color: COLORS.ink, fontSize: 17, marginTop: 6 },
  bad: { color: COLORS.actionDeep, fontSize: 17, fontWeight: "600", marginTop: 6 },
});
