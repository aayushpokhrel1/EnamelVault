import { Stack, useLocalSearchParams } from "expo-router";
import RecipeForm from "../../../src/screens/RecipeForm";

export default function EditRecipeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: "Editing" }} />
      <RecipeForm recipeId={id} />
    </>
  );
}
