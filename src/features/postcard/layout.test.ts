import { describe, expect, it } from "vitest";
import { planAnswers, sideColumns, wrapText, type Measure } from "./layout";

// Every grapheme is half the font size wide.
const measure: Measure = (text, px) => {
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return [...seg.segment(text)].length * px * 0.5;
};

describe("sideColumns (R-608)", () => {
  it("puts 3 photos each side for a group of 6", () => {
    const { left, right } = sideColumns([1, 2, 3, 4, 5, 6]);
    expect(left).toEqual([1, 2, 3]);
    expect(right).toEqual([4, 5, 6]);
  });
  it("puts 5 each side for a solo 10", () => {
    const { left, right } = sideColumns(Array.from({ length: 10 }, (_, i) => i));
    expect([left.length, right.length]).toEqual([5, 5]);
  });
  for (const n of [0, 1, 2, 3, 4, 5, 7, 9]) {
    it(`handles ${n} photos`, () => {
      const { left, right } = sideColumns(Array.from({ length: n }, (_, i) => i));
      expect(left.length + right.length).toBe(n);
      expect(left.length - right.length).toBeGreaterThanOrEqual(0);
      expect(left.length - right.length).toBeLessThanOrEqual(1);
    });
  }
});

describe("wrapText", () => {
  it("wraps at word boundaries", () => {
    expect(wrapText("one two three four", 50, 10, measure)).toEqual(["one two", "three four"]);
  });
  it("breaks a long run of emoji between whole emoji, never inside a flag or family", () => {
    const text = "🇯🇵👨‍👩‍👧🇯🇵👨‍👩‍👧🇯🇵👨‍👩‍👧";
    const lines = wrapText(text, 20, 10, measure);
    expect(lines.join("")).toBe(text);
    expect(lines).toEqual(["🇯🇵👨‍👩‍👧🇯🇵👨‍👩‍👧", "🇯🇵👨‍👩‍👧"]);
  });
  it("keeps right-to-left text in order", () => {
    expect(wrapText("غروب الشمس على البحر", 60, 10, measure).join(" ")).toBe(
      "غروب الشمس على البحر",
    );
  });
});

describe("planAnswers", () => {
  const groups = (players: number) => [
    {
      question: "Moment you'll never forget",
      answers: Array.from({ length: players }, (_, i) => `Answer number ${i + 1} about the sunset`),
    },
    { question: "Your trip in 3 emojis", answers: Array.from({ length: players }, () => "🌊🍝☀️") },
    {
      question: "Best bite",
      answers: Array.from({ length: players }, () => "Pastel de nata, warm"),
    },
  ];
  for (const players of [1, 4, 12]) {
    it(`fits ${players} players' answers`, () => {
      const plan = planAnswers(groups(players), 600, 900, measure);
      expect(plan.clipped).toBe(false);
      expect(plan.blocks.filter((b) => b.kind === "answer")).toHaveLength(players * 3);
    });
  }
  it("uses a smaller font for more answers", () => {
    expect(planAnswers(groups(12), 600, 900, measure).fontPx).toBeLessThan(
      planAnswers(groups(1), 600, 900, measure).fontPx,
    );
  });
  it("drops answers from the end rather than overflowing, never leaving a bare question", () => {
    const plan = planAnswers(groups(12), 200, 200, measure);
    expect(plan.clipped).toBe(true);
    expect(plan.blocks.at(-1)?.kind).toBe("answer");
  });
  it("skips questions nobody answered", () => {
    const plan = planAnswers([{ question: "Song of the trip", answers: [] }], 600, 900, measure);
    expect(plan.blocks).toEqual([]);
  });
});
