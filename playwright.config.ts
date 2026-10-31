// End-to-end smoke tests (M0-11), phone-sized. They run against the dev server with a placeholder
// Supabase URL, so they cover signed-out flows only. Signed-in flows (create trip, join with a
// code in two browsers, open Play) need the local Supabase stack from M0-04 (`supabase start`).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // e2e/live needs the real local stack (playwright.live.config.ts); e2e/pwa a production build
  // with the service worker (playwright.pwa.config.ts)
  testIgnore: ["live/**", "pwa/**"],
  timeout: 60_000,
  // The dev server compiles the 3,000-line index route on first visit; give it time.
  expect: { timeout: 20_000 },
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: { baseURL: "http://localhost:8080", trace: "retain-on-failure" },
  projects: [{ name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium" } }],
  webServer: {
    command: "bun run dev",
    url: "http://localhost:8080/api/public/version",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: process.env["VITE_SUPABASE_URL"] ?? "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY:
        process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "e2e-placeholder-key",
    },
  },
});
