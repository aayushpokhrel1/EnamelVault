import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { COLORS } from "../../../src/mobile/theme";
import type { ShelfRow, SyncState } from "../../../src/mobile/shelf";
import { shelfRows } from "../../../src/mobile/shelf";
import { lastCaughtUpAt } from "../../../src/mobile/sync/catchup";
import { useStore } from "../storeContext";
import { useSync } from "../sync/useSync";

// What each state says to a cook, in words rather than in a colour. A dot alone is unreadable
// to anyone who cannot tell the colours apart, and "failed" with no sentence is a dead end.
const SAYS: Record<SyncState, string | null> = {
  synced: null,
  queued: "Waiting to send",
  failed: "Could not send",
  conflicted: "Someone else changed this",
};

const when = (at: string | null): string => {
  if (at === null) return "Not caught up yet";
  const date = new Date(at);
  return `Caught up ${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

export default function Shelf() {
  const store = useStore();
  const router = useRouter();
  const sync = useSync(store);
  const [rows, setRows] = useState<ShelfRow[] | null>(null);
  const [caughtUp, setCaughtUp] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRows(await shelfRows(store));
    setCaughtUp(await lastCaughtUpAt(store));
  }, [store]);

  useEffect(() => {
    void load();
    // Re-read after every sync finishes, so what landed is on screen without a pull-down.
  }, [load, sync.running]);

  return (
    <View style={styles.screen}>
      <FlatList
        data={rows ?? []}
        keyExtractor={(row) => row.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={COLORS.onWall}
            onRefresh={() => {
              setRefreshing(true);
              void sync
                .sync()
                .then(load)
                .finally(() => setRefreshing(false));
            }}
          />
        }
        ListHeaderComponent={
          <>
            <Text style={styles.caughtUp}>
              {sync.running ? "Catching up…" : when(caughtUp)}
            </Text>
            {/* Said plainly, and only once something was actually tried. Offline is the
                ordinary state for this app, not an error to shout about. */}
            {sync.error !== null && !sync.running && (
              <Text style={styles.caughtUp}>Could not reach the kitchen. Showing what is on this phone.</Text>
            )}
            {/* Scaffolding, and it says so: __DEV__ is false in a release build, so this is
                the one way to reach the SQLite contract check without shipping it. */}
            <Pressable
              style={({ pressed }) => [styles.add, pressed && styles.pressed]}
              accessibilityRole="button"
              onPress={() => router.push("/recipe/new")}
            >
              <Text style={styles.addText}>Add a recipe</Text>
            </Pressable>
            {__DEV__ && (
              <Text
                style={styles.caughtUp}
                accessibilityRole="button"
                onPress={() => router.push("/store-check")}
              >
                Check the local store
              </Text>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.plate}>
            {/* Not shown while rows is null: an empty shelf and a shelf that has not been
                read yet look identical, and telling a cook there is nothing here before
                looking is the kind of wrong that makes people stop trusting a screen. */}
            <Text style={styles.title}>{rows === null ? "Reading your shelf…" : "Nothing here yet"}</Text>
            {rows !== null && (
              <Text style={styles.meta}>
                Recipes you can read will appear here the next time this phone catches up.
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.plate, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={[item.title, item.byline && `by ${item.byline}`, SAYS[item.sync]]
              .filter(Boolean)
              .join(", ")}
            onPress={() =>
              router.push(
                // A conflict goes to the choice, not to the recipe. Tapping a row that says
                // "someone else changed this" and landing on a read-only page is a dead end.
                item.intentId !== null
                  ? `/conflict/${encodeURIComponent(item.intentId)}`
                  : `/recipe/${encodeURIComponent(item.id)}`,
              )
            }
          >
            <Text style={styles.title}>{item.title}</Text>
            {item.byline !== null && <Text style={styles.meta}>by {item.byline}</Text>}
            {item.minutes !== null && <Text style={styles.meta}>{item.minutes} minutes</Text>}
            {SAYS[item.sync] !== null && (
              <Text style={item.sync === "failed" ? styles.bad : styles.note}>{SAYS[item.sync]}</Text>
            )}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.wall },
  list: { padding: 16 },
  caughtUp: { color: COLORS.onWall, fontSize: 15, marginBottom: 12, opacity: 0.8 },
  plate: { backgroundColor: COLORS.plate, borderRadius: 14, marginBottom: 12, padding: 16 },
  pressed: { opacity: 0.9 },
  title: { color: COLORS.ink, fontSize: 20, fontWeight: "700" },
  meta: { color: COLORS.inkSoft, fontSize: 15, marginTop: 2 },
  note: { color: COLORS.chipInk, fontSize: 15, fontWeight: "600", marginTop: 6 },
  bad: { color: COLORS.actionDeep, fontSize: 15, fontWeight: "600", marginTop: 6 },
  add: {
    alignItems: "center",
    backgroundColor: COLORS.action,
    borderRadius: 10,
    justifyContent: "center",
    marginBottom: 12,
    minHeight: 48,
    padding: 12,
  },
  addText: { color: COLORS.onAction, fontSize: 17, fontWeight: "700" },
});
