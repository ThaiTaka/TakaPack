"use server";

import { generateTripTasks as generateTripTasksInternal } from "./trip-plan";
export async function generateTripTasks(prompt: string, memberNamesInput: string) {
  return generateTripTasksInternal(prompt, memberNamesInput);
}
