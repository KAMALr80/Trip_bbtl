import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Look = "original" | "cinematic";
export const LOOK_KEYS = [
  "splash",
  "home-top",
  "home-bottom",
  "passport",
  "boarding",
  "boarding-pass",
  "game-night",
  "spin",
  "journey",
  "calendar",
  "squad",
  "at-home",
  "culture",
  "me",
  "explore",
  "founder",
  "error",
  "buttons",
] as const;
export type LookKey = (typeof LOOK_KEYS)[number];
export type LookSettings = { global: Look; pages: Partial<Record<LookKey, Look>> };
const LookContext = createContext<{ settings: LookSettings | null; reload: () => void }>({
  settings: null,
  reload: () => {},
});
function valid(value: unknown): LookSettings | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { global?: unknown; pages?: unknown };
  if (raw.global !== "original" && raw.global !== "cinematic") return null;
  const pages: LookSettings["pages"] = {};
  if (raw.pages && typeof raw.pages === "object")
    for (const key of LOOK_KEYS) {
      const choice = (raw.pages as Record<string, unknown>)[key];
      if (choice === "original" || choice === "cinematic") pages[key] = choice;
    }
  return { global: raw.global, pages };
}
export function LookProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<LookSettings | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    void supabase
      .from("app_settings")
      .select("look")
      .eq("id", true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (live && !error) setSettings(valid(data?.look));
      });
    return () => {
      live = false;
    };
  }, [version]);
  useEffect(() => {
    document.documentElement.dataset["buttonsLook"] =
      settings?.pages.buttons ?? settings?.global ?? "original";
  }, [settings]);
  return (
    <LookContext.Provider value={{ settings, reload: () => setVersion((v) => v + 1) }}>
      {children}
    </LookContext.Provider>
  );
}
export function useLook(pageKey: LookKey): Look {
  const { settings } = useContext(LookContext);
  return settings?.pages[pageKey] ?? settings?.global ?? "original";
}
export function useLookSettings() {
  return useContext(LookContext);
}
