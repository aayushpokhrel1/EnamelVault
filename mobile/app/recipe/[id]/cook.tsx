import { Stack, useLocalSearchParams } from "expo-router";
import Cook from "../../../src/screens/Cook";

export default function CookRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: "Cooking" }} />
      <Cook id={id} />
    </>
  );
}
