// Service worker tests (M4-02, e2e/pwa). They need a production build with the worker turned on,
// served with Vercel's routes and headers (scripts/serve-build.ts, local only), because the dev
// server has no sw.js. `npx playwright test -c playwright.pwa.config.ts` builds and serves it.
import { defineConfig, devices } from "@playwright/test";

// Without this, Playwright 1.56 doesn't apply context.setOffline() to the service worker's own
// fetches, so "offline" pages would quietly come from the network.
process.env["PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS"] = "1";

const PORT = 4173;

export default defineConfig({
  testDir: "e2e/pwa",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  // The full Chromium in headless mode, not Playwright's default headless shell: the shell can't
  // show notifications (the push test) and is further from what phones run for service workers.
  projects: [
    {
      name: "iphone",
      use: { ...devices["iPhone 13"], browserName: "chromium", channel: "chromium" },
    },
  ],
  webServer: {
    command: `bun run build && bun scripts/serve-build.ts --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/public/version`,
    reuseExistingServer: !process.env["CI"],
    timeout: 300_000,
    env: {
      VITE_SERVICE_WORKER: "true",
      VITE_SUPABASE_URL: process.env["VITE_SUPABASE_URL"] ?? "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY:
        process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "e2e-placeholder-key",
    },
  },
});
