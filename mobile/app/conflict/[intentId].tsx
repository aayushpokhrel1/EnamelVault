import { Stack, useLocalSearchParams } from "expo-router";
import Conflict from "../../src/screens/Conflict";

export default function ConflictRoute() {
  const { intentId } = useLocalSearchParams<{ intentId: string }>();
  return (
    <>
      <Stack.Screen options={{ title: "Two versions" }} />
      <Conflict intentId={intentId} />
    </>
  );
}
