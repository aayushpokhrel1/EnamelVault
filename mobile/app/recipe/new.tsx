import { Stack } from "expo-router";
import RecipeForm from "../../src/screens/RecipeForm";

export default function NewRecipeRoute() {
  return (
    <>
      <Stack.Screen options={{ title: "A new recipe" }} />
      <RecipeForm />
    </>
  );
}
