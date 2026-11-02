import { StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../src/mobile/theme";

// Task 1's deliverable and nothing more: proof that the app builds, boots on a real phone and
// renders on the enamel ground. Task 12 replaces this with the shelf.
export default function Index() {
  return (
    <View style={styles.screen}>
      <View style={styles.plate}>
        <Text style={styles.title}>Family Recipes</Text>
        <Text style={styles.body}>The phone app boots.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.wall, justifyContent: "center", padding: 24 },
  plate: { backgroundColor: COLORS.plate, borderRadius: 16, padding: 20 },
  title: { color: COLORS.ink, fontSize: 28, fontWeight: "700", marginBottom: 6 },
  body: { color: COLORS.inkSoft, fontSize: 17 },
});
