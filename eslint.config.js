import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const serverOnly = {
  name: "server-only",
  message:
    "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
};

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": ["error", { paths: [serverOnly] }],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // M1-05: only the data layer and sign-in talk to Supabase directly. Screens use the typed calls
  // and Query hooks in src/data. Older files are listed in eslint-suppressions.json until moved.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/data/**", "src/features/auth/**", "src/integrations/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [serverOnly],
          patterns: [
            {
              group: ["**/integrations/supabase/client"],
              message: "Use the typed calls and Query hooks in src/data instead.",
            },
          ],
        },
      ],
    },
  },
  eslintPluginPrettier,
);
