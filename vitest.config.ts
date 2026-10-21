// Unit tests (M0-05): pure logic only. Kept apart from vite.config.ts so tests don't load the
// TanStack Start / Nitro build plugins. Database rules are tested with pgTAP (supabase/tests).
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
