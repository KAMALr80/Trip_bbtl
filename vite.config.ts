// Explicit Vite config (M0-10). It replaces @lovable.dev/vite-tanstack-config and keeps what that
// wrapper did outside Lovable's sandbox: Tailwind, tsconfig paths, TanStack Start with import
// protection, Nitro (build only) targeting Cloudflare Workers, React, the @ alias, dedupe and
// VITE_* env injection. Lovable-only pieces (sandbox ports, preview asset proxy, visual-editor
// devtools, document publishing) are dropped.
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type PluginOption, type UserConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command, mode }) => {
  const plugins: PluginOption[] = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
  ];
  if (command === "build") {
    plugins.push(nitro({ defaultPreset: "cloudflare-module" }));
  }
  plugins.push(viteReact());

  // Make VITE_* values available as import.meta.env.* in the server bundle too.
  const define: Record<string, string> = {};
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), "VITE_"))) {
    define[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  // `bun run build:dev` keeps React's development build, like before.
  const devBuild: UserConfig =
    command === "build" && mode === "development"
      ? {
          environments: {
            client: { define: { "process.env.NODE_ENV": JSON.stringify("development") } },
          },
        }
      : {};

  return {
    ...devBuild,
    define,
    plugins,
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    server: { host: true, port: 8080 }, // all addresses; "::" fails on hosts without IPv6
  };
});
