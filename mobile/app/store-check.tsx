import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { COLORS } from "../../src/mobile/theme";
import { checkSqliteStore } from "../src/store/checkContract";
import type { CaseResult } from "../src/store/checkContract";

/**
 * Task 8's proof, and the only place it can happen: expo-sqlite is native, so vitest cannot
 * reach it, and the same contract the memory store is tested against has to be run here or
 * the implementation that actually ships has never been checked.
 */
export default function StoreCheck() {
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
      <Stack.Screen options={{ title: "The local store" }} />
      <ScrollView contentContainerStyle={styles.plate}>
        {crashed !== null && <Text style={styles.bad}>The store would not open: {crashed}</Text>}
        {results === null && crashed === null && <Text style={styles.body}>Checking…</Text>}
        {results !== null && (
          <Text style={failed.length === 0 ? styles.good : styles.bad}>
            {failed.length === 0
              ? `All ${results.length} promises kept.`
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
  screen: { flex: 1, backgroundColor: COLORS.wall },
  plate: { backgroundColor: COLORS.plate, borderRadius: 16, margin: 16, padding: 20 },
  body: { color: COLORS.inkSoft, fontSize: 16, marginTop: 6 },
  good: { color: COLORS.ink, fontSize: 17, fontWeight: "600" },
  bad: { color: COLORS.actionDeep, fontSize: 17, fontWeight: "600" },
});
