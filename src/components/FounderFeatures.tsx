import { tripDisplayName } from "@/lib/trip-display-name";
import { confirmInApp } from "@/lib/confirm";
import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { FEATURE_LABELS, type FeatureKey } from "@/lib/features";
import { LOOK_KEYS, useLookSettings, type Look, type LookKey, type LookSettings } from "@/lib/look";

const db = supabase as unknown as {
  rpc: (n: string, a?: object) => Promise<{ data: unknown; error: { message: string } | null }>;
};
type Settings = {
  features: Record<FeatureKey, boolean>;
  slice_pct: number;
  max_trips: number;
  ai_daily: number;
  ai_credits: number;
};
type TripRow = {
  id: string;
  name: string;
  level: "full" | "preview";
  kind: string | null;
  captain: string | null;
};
type Log = {
  id: number;
  kind: string;
  target: string;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
};
const field = "w-full rounded-2xl border border-border bg-card px-3 py-2 text-sm";

/** Founder-only (server-checked): Preview feature switches, library slice, limits, trip levels and change log. */
export function FounderFeatures() {
  const { settings: currentLook, reload: reloadLook } = useLookSettings();
  const [lookDraft, setLookDraft] = useState<LookSettings | null>(null);
  const [data, setData] = useState<{ settings: Settings; trips: TripRow[]; log: Log[] } | null>(
    null,
  );
  const [draft, setDraft] = useState<Settings | null>(null);
  const [q, setQ] = useState(""),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    const r = await db.rpc("founder_preview");
    if (r.error) setMsg(friendlyError(r.error));
    else {
      const d = r.data as NonNullable<typeof data>;
      setData(d);
      setDraft(d.settings);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (currentLook) setLookDraft(currentLook);
  }, [currentLook]);
  if (!data || !draft)
    return <p className="text-sm text-muted-foreground mt-4">{msg || "Loading…"}</p>;
  const num = (
    k: "slice_pct" | "max_trips" | "ai_daily" | "ai_credits",
    label: string,
    min: number,
    max: number,
  ) => (
    <label className="block text-sm font-bold">
      {label}
      <input
        className={`${field} mt-1`}
        type="number"
        min={min}
        max={max}
        value={draft[k]}
        onChange={(e) =>
          setDraft({ ...draft, [k]: Math.max(min, Math.min(max, Number(e.target.value) || min)) })
        }
      />
    </label>
  );
  async function save() {
    setBusy(true);
    setMsg("");
    const r = await db.rpc("founder_set_preview", {
      p_features: draft!.features,
      p_slice: draft!.slice_pct,
      p_max: draft!.max_trips,
      p_daily: draft!.ai_daily,
      p_credits: draft!.ai_credits,
    });
    setBusy(false);
    setMsg(r.error ? friendlyError(r.error) : "Saved ✓");
    await load();
  }
  async function level(t: TripRow) {
    const to = t.level === "full" ? "preview" : "full";
    if (!(await confirmInApp(`Switch ${t.name} to ${to.toUpperCase()}?`))) return;
    const r = await db.rpc("founder_set_trip_level", { p_trip: t.id, p_level: to });
    if (r.error) setMsg(friendlyError(r.error));
    await load();
  }
  const trips = data.trips.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));
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
      </section>
      <section className="app-card mt-5">
        <p className="eyebrow text-primary">PREVIEW TRIP FEATURES</p>
        <p className="text-sm text-muted-foreground mt-1">
          FULL trips always get everything. Off features show a “Coming soon” card in PREVIEW trips.
        </p>
        <div className="mt-3 space-y-2">
          {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((k) => (
            <label
              key={k}
              className="flex items-center justify-between gap-3 rounded-2xl bg-muted p-3"
            >
              <span className="font-bold text-sm">{FEATURE_LABELS[k]}</span>
              <input
                type="checkbox"
                className="size-6 accent-[var(--primary)]"
                checked={!!draft.features[k]}
                onChange={(e) =>
                  setDraft({ ...draft, features: { ...draft.features, [k]: e.target.checked } })
                }
              />
            </label>
          ))}
        </div>
      </section>
      <section className="app-card mt-5 space-y-3">
        <p className="eyebrow text-blue">SURPRISE + LIMITS</p>
        {num("slice_pct", "Library slice for PREVIEW (% , rotates weekly)", 1, 100)}
        {num("max_trips", "Trips per tester", 1, 50)}
        {num("ai_daily", "AI ideas per trip per day", 0, 100)}
        {num("ai_credits", "Included AI credits per PREVIEW trip", 0, 500)}
        <Button variant="playful" className="w-full" disabled={busy} onClick={() => void save()}>
          Save settings
        </Button>
        {msg && (
          <p role="status" className="text-sm">
            {msg}
          </p>
        )}
      </section>
      <section className="app-card mt-5">
        <p className="eyebrow text-green">TRIP LEVELS</p>
        <input
          className={`${field} mt-2`}
          placeholder="Search trips"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
          {trips.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-2xl bg-muted p-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold truncate">{tripDisplayName(t.name)}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {t.captain ?? "Captain"}
                  {t.kind === "at_home" ? " · At Home" : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant={t.level === "full" ? "green" : "outline"}
                onClick={() => void level(t)}
              >
                {t.level.toUpperCase()}
              </Button>
            </div>
          ))}
        </div>
      </section>
      <section className="app-card mt-5">
        <p className="eyebrow">CHANGE LOG</p>
        {data.log.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-2">No changes yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs">
            {data.log.map((l) => (
              <li key={l.id}>
                <span className="text-muted-foreground">
                  {new Date(l.created_at).toLocaleString()}
                </span>{" "}
                ·{" "}
                {l.kind === "feature"
                  ? (FEATURE_LABELS[l.target as FeatureKey] ?? l.target)
                  : l.target}
                : {JSON.stringify(l.old_value)} → {JSON.stringify(l.new_value)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
