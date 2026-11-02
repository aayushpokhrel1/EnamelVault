import { Stack } from "expo-router";
import Shelf from "../src/screens/Shelf";

// The route is a title and a screen. Everything the shelf does lives in src/mobile/shelf.ts,
// where the suite can reach it without a simulator.
export default function Index() {
  return (
    <>
      <Stack.Screen options={{ title: "Family Recipes" }} />
      <Shelf />
    </>
  );
}
