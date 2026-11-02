// Wrap-up answers (R-604): about 60 characters, and the emoji question takes exactly 3 emojis.
// display-only; server: trip_private.answer_wrapup / is_three_emojis. Both run the cases in
// supabase/tests/fixtures/wrapup.json, so the app and the server accept the same answers.

export const MAX_ANSWER = 60;

// One emoji: a flag (two regional indicators), a keycap, or a pictograph, plus its skin tone /
// variation selector / tag characters, joined into ZWJ sequences. Same ranges as the SQL.
const base =
  "(?:[\\u{1F1E6}-\\u{1F1FF}][\\u{1F1E6}-\\u{1F1FF}]|[0-9#*]\\u{FE0F}?\\u{20E3}|" +
  "[\\u{00A9}\\u{00AE}\\u{203C}\\u{2049}\\u{2122}\\u{2139}\\u{2194}-\\u{2199}\\u{21A9}\\u{21AA}\\u{231A}\\u{231B}" +
  "\\u{2328}\\u{23CF}\\u{23E9}-\\u{23F3}\\u{23F8}-\\u{23FA}\\u{24C2}\\u{25AA}\\u{25AB}\\u{25B6}\\u{25C0}" +
  "\\u{25FB}-\\u{25FE}\\u{2600}-\\u{27BF}\\u{2934}\\u{2935}\\u{2B05}-\\u{2B07}\\u{2B1B}\\u{2B1C}\\u{2B50}\\u{2B55}" +
  "\\u{3030}\\u{303D}\\u{3297}\\u{3299}\\u{1F000}-\\u{1F1E5}\\u{1F200}-\\u{1FAFF}])";
const mods = "(?:\\u{FE0F}|[\\u{1F3FB}-\\u{1F3FF}]|[\\u{E0020}-\\u{E007F}])*";
const one = `${base}${mods}(?:\\u{200D}${base}${mods})*`;
const three = new RegExp(`^\\s*${one}\\s*${one}\\s*${one}\\s*$`, "u");

/** Trim like the server (any whitespace at either end). */
export function trimAnswer(answer: string): string {
  return answer.replace(/^\s+|\s+$/gu, "");
}

/** Characters as the server counts them (code points, so an emoji isn't counted as 2). */
export function answerLength(answer: string): number {
  return [...trimAnswer(answer)].length;
}

export function isThreeEmojis(answer: string): boolean {
  return three.test(answer);
}

export type AnswerProblem = "empty" | "too_long" | "three_emojis";

/** Why an answer would be refused, or null if the server will take it. */
export function answerProblem(answer: string, emoji: boolean): AnswerProblem | null {
  const v = trimAnswer(answer);
  if (!v) return "empty";
  if (answerLength(v) > MAX_ANSWER) return "too_long";
  if (emoji && !isThreeEmojis(v)) return "three_emojis";
  return null;
}
