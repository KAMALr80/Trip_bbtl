// The mocked E2E suite (e2e/*.spec.ts) against a production build, as users get it: the Worker
// served by scripts/serve-build.ts (Vercel's routes, local only), with the same placeholder Supabase URL and mocks as playwright.config.ts.
// Use this for release runs. The dev server serves about 516 separate modules per cold page and
// slows down over a long run on a busy machine, which left random tests waiting on a page whose
// scripts never arrived; a build serves a handful of files. `npx playwright test` (dev server)
// stays the quick loop while coding.
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const PORT = 4175;

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: `bun run build && bun scripts/serve-build.ts --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/public/version`,
    reuseExistingServer: !process.env["CI"],
    timeout: 300_000,
    env: {
      VITE_SUPABASE_URL: process.env["VITE_SUPABASE_URL"] ?? "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY:
        process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "e2e-placeholder-key",
      // The offline tests have their own config (playwright.pwa.config.ts).
      VITE_SERVICE_WORKER: "false",
    },
  },
});
