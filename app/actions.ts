"use server";

import { generateTripTasks as generateTripTasksInternal } from "./trip-plan";
export async function generateTripTasks(
  prompt: string,
  memberNamesInput: string,
  overrideContextKind?:
    | "auto"
    | "charity"
    | "farewell"
    | "home-party"
    | "outdoor"
    | "celebration"
    | "workshop"
    | "community"
    | "generic",
  planningMode?: "simple" | "normal" | "complex"
) {
  return generateTripTasksInternal(prompt, memberNamesInput, overrideContextKind, planningMode);
}
