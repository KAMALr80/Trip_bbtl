// Appends the local practice prompts (src/lib/practice-prompts.ts) to the candidates CSV on stdout.
import { practicePrompts } from "../../src/lib/practice-prompts";

const csv = (v: string | number | boolean | null) =>
  v === null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);

for (const [game, prompts] of Object.entries(practicePrompts)) {
  prompts.forEach((body, i) => {
    const row = [
      "practice-prompts.ts",
      `${game}:${i}`,
      "flight_game",
      "game_night,trip",
      "trip,at_home",
      null,
      null,
      `practice game ${game}`,
      null,
      body,
      null,
      13,
      "f",
      i < 40 ? "generated combination (template x topic x place)" : "hand-written extra",
    ];
    console.log(row.map(csv).join(","));
  });
}
