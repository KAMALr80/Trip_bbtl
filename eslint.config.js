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

const copyMessage =
  'Put user-facing copy in src/i18n/en.json and read it with t() (`useT()` from "@/i18n").';

export default tseslint.config(
  { ignores: ["dist", ".output", ".vercel", ".vinxi"] },
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
      // B-03: TanStack Start deprecated createServerFn().inputValidator(); validator() is the same.
      "no-restricted-properties": [
        "error",
        { property: "inputValidator", message: "Use createServerFn().validator() instead." },
      ],
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
  // M1-07: user-facing copy lives in src/i18n/en.json and is read with t(). Text written straight
  // into JSX (or into aria-label, placeholder, title, alt) fails; older copy is listed in
  // eslint-suppressions.json and moves to the catalog as screens are rebuilt.
  {
    files: ["src/**/*.tsx"],
    ignores: ["src/components/ui/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "JSXText[value=/[A-Za-z]{2,}/]", message: copyMessage },
        {
          selector:
            "JSXAttribute[name.name=/^(aria-label|placeholder|title|alt)$/] > Literal[value=/[A-Za-z]{2,}/]",
          message: copyMessage,
        },
      ],
    },
  },
  eslintPluginPrettier,
);
