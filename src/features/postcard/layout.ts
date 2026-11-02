// Trip Postcard layout (M5-04, R-608): photos down both sides (3 each for a group, 5 each solo),
// the answers grouped by question in the middle. Pure functions so the on-screen card and the
// downloadable image share one layout, and so it can be tested without a browser.

export type Measure = (text: string, fontPx: number) => number;

/** Split the kept photos into the left and right columns (left gets the odd one). */
export function sideColumns<T>(photos: readonly T[]): { left: T[]; right: T[] } {
  const half = Math.ceil(photos.length / 2);
  return { left: photos.slice(0, half), right: photos.slice(half) };
}

/** Graphemes, so a family emoji or a flag is never split across lines. */
function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...seg.segment(text)].map((s) => s.segment);
  }
  return [...text];
}

/** Word-wrap one string to a width. A word wider than the line is broken between graphemes. */
export function wrapText(
  text: string,
  maxWidth: number,
  fontPx: number,
  measure: Measure,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/u).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next, fontPx) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    if (measure(word, fontPx) <= maxWidth) {
      line = word;
      continue;
    }
    for (const g of graphemes(word)) {
      if (line && measure(line + g, fontPx) > maxWidth) {
        lines.push(line);
        line = g;
      } else line += g;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export type TextBlock = { kind: "question" | "answer"; lines: string[] };
export type AnswerPlan = {
  fontPx: number;
  lineHeight: number;
  blocks: TextBlock[];
  clipped: boolean;
};

/**
 * Fit the grouped answers into the middle panel: the largest font (down to `minPx`) at which all of
 * it fits. If even the smallest font overflows, answers are dropped from the end and `clipped` set.
 */
export function planAnswers(
  groups: readonly { question: string; answers: readonly string[] }[],
  width: number,
  height: number,
  measure: Measure,
  { maxPx = 30, minPx = 14 }: { maxPx?: number; minPx?: number } = {},
): AnswerPlan {
  const build = (fontPx: number) => {
    const blocks: TextBlock[] = [];
    for (const g of groups) {
      if (!g.answers.length) continue;
      blocks.push({ kind: "question", lines: wrapText(g.question, width, fontPx * 0.8, measure) });
      for (const a of g.answers)
        blocks.push({ kind: "answer", lines: wrapText(a, width, fontPx, measure) });
    }
    return blocks;
  };
  const used = (blocks: TextBlock[], lineHeight: number) =>
    blocks.reduce(
      (h, b) => h + b.lines.length * lineHeight + (b.kind === "question" ? lineHeight * 0.4 : 0),
      0,
    );
  for (let fontPx = maxPx; fontPx >= minPx; fontPx -= 2) {
    const blocks = build(fontPx);
    const lineHeight = Math.round(fontPx * 1.3);
    if (used(blocks, lineHeight) <= height) return { fontPx, lineHeight, blocks, clipped: false };
  }
  const lineHeight = Math.round(minPx * 1.3);
  const blocks = build(minPx);
  while (blocks.length && used(blocks, lineHeight) > height) blocks.pop();
  // Never end on a question with no answer under it.
  while (blocks.length && blocks[blocks.length - 1]!.kind === "question") blocks.pop();
  return { fontPx: minPx, lineHeight, blocks, clipped: true };
}
