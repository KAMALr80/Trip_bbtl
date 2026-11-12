// Signed-in tests against the real local Supabase stack (e2e/live). Needs VITE_SUPABASE_URL and
// VITE_SUPABASE_PUBLISHABLE_KEY from `supabase status -o env` (see the `supabase` job in CI).
import { defineConfig, devices } from "@playwright/test";

const url = process.env["VITE_SUPABASE_URL"];
const key = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
if (!url || !key)
  throw new Error(
    "Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (supabase status -o env)",
  );

export default defineConfig({
  testDir: "e2e/live",
  // Opens "/" once first so the dev server's first-visit compile doesn't hit the first test.
  globalSetup: "./e2e/support/warm-up.ts",
  timeout: 90_000,
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
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
      // Server routes (the public guide) use the service role.
      SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",
    },
  },
});
