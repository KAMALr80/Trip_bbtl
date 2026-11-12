// Playwright global setup: open "/" once before the specs run. A fresh Vite dev server compiles the
// index route and optimises its dependencies on the first visit (20–60 s on a slow machine), and
// Vite may reload the page when it finds a new dependency. Doing that here keeps it from landing
// on whichever test happens to run first; no test's timeout or assertions change.
import { chromium, type FullConfig } from "@playwright/test";

export default async function warmUp(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(baseURL, { waitUntil: "load", timeout: 180_000 });
    // The signed-out screen means the app booted. If it never shows, the specs report why.
    await page
      .getByRole("button", { name: "Sign in with email" })
      .waitFor({ timeout: 180_000 })
      .catch(() => undefined);
  } finally {
    await browser.close();
  }
}
