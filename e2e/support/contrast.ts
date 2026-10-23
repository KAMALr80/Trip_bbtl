// WCAG text contrast for the shell's translucent cards (M1-12). axe leaves text over semi-transparent
// or gradient layers "incomplete"; this blends each element's background colours up to the page and
// measures what is actually painted. Background images are ignored (their dark scrim is a colour).
import type { Page } from "@playwright/test";

export type LowContrast = { text: string; ratio: number; need: number; selector: string };

export function lowContrast(page: Page): Promise<LowContrast[]> {
  return page.evaluate(() => {
    const parse = (c: string): [number, number, number, number] => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 0];
      const p = m[1]!
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
    };
    const over = (top: number[], under: number[]) => {
      const a = top[3]!;
      return [0, 1, 2].map((i) => top[i]! * a + under[i]! * (1 - a)).concat(1);
    };
    const lum = (c: number[]) => {
      const [r, g, b] = c.slice(0, 3).map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    // The colours painted behind `el`: one per gradient stop when a layer is a gradient, or null
    // when a photo is behind it (not measurable here).
    const backdrops = (el: Element | null): number[][] | null => {
      const layers: number[][][] = [];
      for (let e = el; e; e = e.parentElement) {
        const s = getComputedStyle(e);
        const op = Number(s.opacity);
        if (s.backgroundImage.includes("url(")) return null;
        const stops = s.backgroundImage.includes("gradient")
          ? [...s.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0]))
          : [];
        const bg = parse(s.backgroundColor);
        if (stops.length) layers.push(stops.map((c) => [c[0], c[1], c[2], c[3] * op]));
        else if (bg[3] > 0) layers.push([[bg[0], bg[1], bg[2], bg[3] * op]]);
        if (stops.every((c) => c[3] === 1) && (stops.length || bg[3] === 1) && op === 1) break;
      }
      let base = parse(getComputedStyle(document.body).backgroundColor);
      if (base[3] === 0) base = [255, 255, 255, 1];
      let out: number[][] = [base];
      for (const layer of layers.reverse())
        out = layer.flatMap((top) => out.map((under) => over(top, under)));
      return out;
    };
    const out: { text: string; ratio: number; need: number; selector: string }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || !n.textContent?.trim()) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (
        !r.width ||
        !r.height ||
        s.visibility === "hidden" ||
        el.closest("[aria-hidden=true],.sr-only")
      )
        continue;
      // Skip text under a dialog's backdrop, and gradient-filled (background-clip: text) words.
      const hit = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + Math.min(r.height / 2, 8),
      );
      if (hit && !el.contains(hit) && !hit.contains(el)) continue;
      if (s.webkitTextFillColor === "transparent" || s.color.endsWith(", 0)")) continue;
      let opacity = 1;
      for (let e: Element | null = el; e; e = e.parentElement)
        opacity *= Number(getComputedStyle(e).opacity);
      const bgs = backdrops(el);
      if (!bgs) continue;
      const fg = parse(s.color);
      const ratio = Math.min(
        ...bgs.map((bg) => {
          const fgOn = over([fg[0], fg[1], fg[2], fg[3] * opacity], bg);
          const [a, b] = [lum(fgOn), lum(bg)].sort((x, y) => y - x);
          return (a! + 0.05) / (b! + 0.05);
        }),
      );
      const size = parseFloat(s.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      if (
        ratio < need &&
        !(el as HTMLButtonElement).disabled &&
        !el.closest(":disabled,[aria-disabled=true]")
      )
        out.push({
          text: n.textContent.trim().slice(0, 60),
          ratio: Math.round(ratio * 100) / 100,
          need,
          selector: `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 4).join(".")}`,
        });
    }
    return out;
  });
}
