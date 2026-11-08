// The Google Fonts stylesheets, loaded without blocking the app. As <link rel="stylesheet"> in the
// head they held back the app's scripts until Google answered, so a slow or blocked
// fonts.googleapis.com left the splash screen up with no JavaScript running (seen as the
// stuck-splash E2E flake). Now the head only preloads them, and they are applied once the app has
// started; until then the system fonts show (the CSS already uses display=swap).
export const FONT_STYLESHEETS = [
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700;800&family=Fredoka:wght@600;700&display=swap",
  "https://fonts.googleapis.com/css2?family=Caveat:wght@700&display=swap",
] as const;

/** Adds each stylesheet once. Safe to call again (route changes, React strict mode). */
export function applyWebFonts(doc: Pick<Document, "head" | "createElement"> = document) {
  const present = new Set(
    [...doc.head.querySelectorAll("link[rel=stylesheet]")].map((l) => l.getAttribute("href")),
  );
  for (const href of FONT_STYLESHEETS) {
    if (present.has(href)) continue;
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    doc.head.appendChild(link);
  }
}
