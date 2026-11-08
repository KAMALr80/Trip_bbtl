import { describe, expect, it } from "vitest";
import { FONT_STYLESHEETS, applyWebFonts } from "./web-fonts";

// The few DOM calls applyWebFonts makes, without a browser.
function fakeDocument() {
  const links: { rel: string; href: string; getAttribute: (k: string) => string }[] = [];
  const doc = {
    head: {
      querySelectorAll: () => links.filter((l) => l.rel === "stylesheet"),
      appendChild: (l: (typeof links)[number]) => links.push(l),
    },
    createElement: () => {
      const l = { rel: "", href: "", getAttribute: (k: string) => (k === "href" ? l.href : l.rel) };
      return l;
    },
  };
  return { doc: doc as unknown as Pick<Document, "head" | "createElement">, links };
}

describe("applyWebFonts", () => {
  it("adds each font stylesheet once, however often it runs", () => {
    const { doc, links } = fakeDocument();
    applyWebFonts(doc);
    applyWebFonts(doc);
    expect(links.map((l) => l.href)).toEqual([...FONT_STYLESHEETS]);
  });
});
