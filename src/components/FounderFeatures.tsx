import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LOOK_KEYS, useLookSettings, type Look, type LookKey, type LookSettings } from "@/lib/look";

const db = supabase as unknown as {
  rpc: (n: string, a?: object) => Promise<{ data: unknown; error: { message: string } | null }>;
};
const field = "w-full rounded-2xl border border-border bg-card px-3 py-2 text-sm";

/** Founder-only (server-checked): the app look. Preview levels and feature switches were removed in M1-10. */
export function FounderFeatures() {
  const { settings: currentLook, reload: reloadLook } = useLookSettings();
  const [lookDraft, setLookDraft] = useState<LookSettings | null>(null);
  const [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (currentLook) setLookDraft(currentLook);
  }, [currentLook]);
  return (
    <>
      <section className="app-card mt-5 space-y-3">
        <p className="eyebrow text-blue">LOOK</p>
        <label className="block text-sm font-bold">
          Global appearance
          <select
            className={`${field} mt-1`}
            value={lookDraft?.global ?? "original"}
            disabled={!lookDraft}
            onChange={(e) =>
              setLookDraft((d) => (d ? { ...d, global: e.target.value as Look } : d))
            }
          >
            <option value="original">Original</option>
            <option value="cinematic">Cinematic</option>
          </select>
        </label>
        <div className="max-h-80 overflow-y-auto space-y-2">
          {LOOK_KEYS.filter((k) => k !== "buttons").map((key) => (
            <label key={key} className="flex items-center justify-between gap-2 text-sm">
              <span className="capitalize">{key.replaceAll("-", " ")}</span>
              <select
                aria-label={`${key} look`}
                className="rounded-lg border border-border bg-card p-2 text-sm"
                value={lookDraft?.pages[key] ?? "follow"}
                disabled={!lookDraft}
                onChange={(e) =>
                  setLookDraft((d) => {
                    if (!d) return d;
                    const pages = { ...d.pages };
                    if (e.target.value === "follow") delete pages[key];
                    else pages[key as LookKey] = e.target.value as Look;
                    return { ...d, pages };
                  })
                }
              >
                <option value="follow">Follow global</option>
                <option value="original">Original</option>
                <option value="cinematic">Cinematic</option>
              </select>
            </label>
          ))}
        </div>
        <label className="flex items-center justify-between gap-2 text-sm">
          <span>Buttons</span>
          <select
            aria-label="buttons look"
            className="rounded-lg border border-border bg-card p-2 text-sm"
            value={lookDraft?.pages.buttons ?? "follow"}
            disabled={!lookDraft}
            onChange={(e) =>
              setLookDraft((d) => {
                if (!d) return d;
                const pages = { ...d.pages };
                if (e.target.value === "follow") delete pages.buttons;
                else pages.buttons = e.target.value as Look;
                return { ...d, pages };
              })
            }
          >
            <option value="follow">Follow global</option>
            <option value="original">Original</option>
            <option value="cinematic">Cinematic</option>
          </select>
        </label>
        <Button
          variant="playful"
          className="w-full"
          disabled={!lookDraft || busy}
          onClick={async () => {
            if (!lookDraft) return;
            setBusy(true);
            const r = await db.rpc("founder_set_look", { p_look: lookDraft });
            setBusy(false);
            setMsg(r.error ? friendlyError(r.error) : "Look saved ✓");
            if (!r.error) reloadLook();
          }}
        >
          Save look
        </Button>
        {msg && (
          <p role="status" className="text-sm">
            {msg}
          </p>
        )}
      </section>
    </>
  );
}
