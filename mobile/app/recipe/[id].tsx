import { Stack, useLocalSearchParams } from "expo-router";
import Recipe from "../../src/screens/Recipe";

export default function RecipeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <Recipe id={id} />
    </>
  );
}
