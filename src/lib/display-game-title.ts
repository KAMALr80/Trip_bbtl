/** Presentation only: catalog names and saved game identifiers stay unchanged. */
const displayNames: Record<string, string> = {
  "scavenger hunt": "Scavenger Hunt", "mix it up": "Mix It Up", "bingo": "Bingo",
  "guess the song": "Guess the Song", "never have i ever": "Never Have I Ever",
  "20-sec draw": "30-Sec Draw", "30-sec draw": "30-Sec Draw", "spin the wheel": "Spin the Wheel",
  "two truths & lie": "Two Truths & a Lie", "two truths & a lie": "Two Truths & a Lie",
  "vote showdown": "Vote Showdown", "card flip": "Card Flip",
  "would you rather": "Would You Rather", "question of the week": "Question of the Week",
};
export function displayGameTitle(title: string) { return displayNames[title.trim().toLocaleLowerCase()] ?? title; }

/** Presentation labels only; never change persisted catalog game names/numbers. */
export const GAME_TYPES = ["Act It", "Make It", "Taste It", "Sing It", "Move It", "Dress It", "Tell It", "Know It", "Guess It", "Pitch It", "Draw It", "Know Each Other", "Team Up", "Vote It", "Find It"] as const;
export const LEARNING_LENSES = ["culture", "history", "food", "music", "language", "business", "money", "health", "sports", "landmarks", "traditions"] as const;
const catalogTypes: Record<number, typeof GAME_TYPES[number]> = { 1: "Know Each Other", 2: "Guess It", 3: "Sing It", 4: "Act It", 5: "Know It", 6: "Tell It", 7: "Make It", 8: "Vote It", 9: "Draw It", 10: "Tell It", 11: "Guess It", 12: "Vote It", 13: "Know Each Other", 14: "Know Each Other", 15: "Pitch It" };
export function gameType(gameNumber: number): typeof GAME_TYPES[number] { return catalogTypes[gameNumber] ?? "Team Up"; }
export function gameTypes(gameNumber: number): readonly (typeof GAME_TYPES[number])[] {
  const additional: Record<number, readonly (typeof GAME_TYPES[number])[]> = { 4: ["Tell It"], 7: ["Taste It"], 9: ["Dress It"], 10: ["Find It"], 11: ["Move It"], 15: ["Team Up"] };
  return [gameType(gameNumber), ...(additional[gameNumber] ?? [])];
}
const arcadeTypes: Record<string, typeof GAME_TYPES[number]> = { "card flip": "Know Each Other", "spin the wheel": "Team Up", "30-sec draw": "Draw It", "guess the song": "Sing It", "never have i ever": "Know Each Other", "vote showdown": "Vote It", "two truths & lie": "Know Each Other", "bingo": "Find It", "scavenger hunt": "Find It", "mix it up": "Team Up" };
export function arcadeGameType(title: string) { return arcadeTypes[title.trim().toLowerCase()] ?? "Team Up"; }
