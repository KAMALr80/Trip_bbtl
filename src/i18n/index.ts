// i18n (M1-07, Q15). English is the only language for now; every user-facing string in new code
// goes into ./en.json and is read with `t("area.key")` (from `useT()` in components), so Spanish
// later is a translation job, not a refactor. Keys are type-checked against en.json.
import i18next from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import en from "./en.json";

export const languages = ["en"] as const;
export type Language = (typeof languages)[number];

/** The first device language we support, else English. Server renders use English. */
export function detectLanguage(preferred: readonly string[] | undefined): Language {
  for (const tag of preferred ?? []) {
    const base = tag.toLowerCase().split("-")[0];
    const match = languages.find((l) => l === base);
    if (match) return match;
  }
  return "en";
}

void i18next.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: detectLanguage(typeof navigator === "undefined" ? undefined : navigator.languages),
  fallbackLng: "en",
  supportedLngs: languages,
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export const i18n = i18next;
/** Translate outside React (toasts, helpers). Components use `useT()`. */
export const t = i18next.t.bind(i18next);
export function useT() {
  return useTranslation().t;
}

declare module "i18next" {
  interface CustomTypeOptions {
    resources: { translation: typeof en };
    returnNull: false;
  }
}
