import { rpc } from "@/data/rpc";
import { useEffect, useState } from "react";
import { EyeOff, Flag, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { friendlyError } from "@/lib/friendly-error";
import { COUNTRIES, placeLabel } from "@/lib/places";
import { ReportSheet } from "./ReportSheet";

export type Preview = {
  id: string;
  kind: "trip" | "at_home" | "culture_home" | "culture_travel";
  country: string | null;
  region: string | null;
  city: string | null;
  month_year: string | null;
  length_days: number | null;
  vibe: string | null;
  squad_size: number | null;
  games_played: number;
  checkin_done: number;
  takeoff_done: number;
  task_titles: string[];
  game_nights: number;
  stamps_earned: number;
  culture_public: boolean;
  unlisted_at: string | null;
};
const KIND: Record<Preview["kind"], string> = {
  trip: "Trip",
  at_home: "At Home",
  culture_home: "Travel From Home · Culture",
  culture_travel: "Window Seat · On a Trip",
};

/** Country names from the server become ISO codes so PlaceBrowser can group and flag them. */
export function countryCodeOf(value: string | null) {
  if (!value) return null;
  if (/^[A-Z]{2}$/.test(value)) return value;
  const v = value.trim().toLowerCase();
  return COUNTRIES.find((c) => c.name.toLowerCase() === v)?.code ?? null;
}
const monthLabel = (m: string | null) =>
  m
    ? new Date(`${m}-15T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : "";

/** Wrapped toggle — Captain (trip / At Home) or creator (Culture stories). Default off; unshare anytime. */
export function PreviewShareToggle({ tripId, expId }: { tripId?: string; expId?: string }) {
  const [on, setOn] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    void rpc("my_preview_shared", { p_trip: tripId ?? null, p_exp: expId ?? null }).then(
      ({ data }) => setOn(!!data),
    );
  }, [tripId, expId]);
  async function change(value: boolean) {
    setBusy(true);
    setError("");
    const { data, error: e } = await rpc("share_preview", {
      p_trip: tripId ?? null,
      p_exp: expId ?? null,
      p_on: value,
    });
    if (e) setError(friendlyError(e));
    else setOn(Boolean(data));
    setBusy(false);
  }
  return (
    <div className="app-card mt-4 text-left text-foreground">
      <label className="flex items-center justify-between gap-3 font-bold">
        Share a preview to inspire others
        <Switch
          checked={on}
          disabled={busy}
          onCheckedChange={(v) => void change(v)}
          aria-label="Share a preview to inspire others"
        />
      </label>
      <p className="text-xs text-muted-foreground mt-1">
        Text only: place (city level), type, month, length, vibe, squad size, games and task titles.
        Never photos, names, dates or answers. Turn it off anytime.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive mt-2">
          {error}
        </p>
      )}
    </div>
  );
}

export function PreviewCard({
  p,
  isFounder,
  onChanged,
  onOpenCulture,
}: {
  p: Preview;
  isFounder?: boolean | undefined;
  onChanged: () => void;
  onOpenCulture?: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reporting, setReporting] = useState(false);
  async function act(action: string, reason?: string) {
    setBusy(true);
    setError("");
    const { error: e } = await rpc("preview_action", {
      p_preview: p.id,
      p_action: action,
      p_reason: reason ?? null,
    });
    if (e) setError(friendlyError(e));
    else onChanged();
    setBusy(false);
  }
  const place =
    placeLabel({ country: countryCodeOf(p.country), region: p.region, city: p.city }) ||
    "Somewhere fun";
  const stats = [
    p.length_days ? `${p.length_days} ${p.length_days === 1 ? "day" : "days"}` : null,
    p.vibe ? `${p.vibe[0]!.toUpperCase()}${p.vibe.slice(1)} vibe` : null,
    p.squad_size ? `Squad of ${p.squad_size}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <article className="app-card mt-3 min-w-0">
      <p className="eyebrow text-orange">
        {KIND[p.kind].toUpperCase()} · {monthLabel(p.month_year).toUpperCase()}
      </p>
      <h3 className="font-display text-lg font-extrabold mt-1 break-words">{place}</h3>
      {stats && <p className="text-sm text-muted-foreground">{stats}</p>}
      {(p.kind === "trip" || p.kind === "at_home") && (
        <p className="text-sm mt-2">
          {p.game_nights} game {p.game_nights === 1 ? "night" : "nights"} · {p.games_played} games ·
          🛂 {p.stamps_earned} stamps · {p.checkin_done} Early Check-In · {p.takeoff_done} Takeoff
          tasks
        </p>
      )}
      {p.task_titles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {p.task_titles.map((t) => (
            <span key={t} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold">
              {t}
            </span>
          ))}
        </div>
      )}
      {p.culture_public && onOpenCulture && (
        <Button size="sm" variant="outline" className="mt-3" onClick={onOpenCulture}>
          Open the shared experience
        </Button>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <span
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground opacity-70"
          aria-label="Likes coming soon"
        >
          <Heart size={12} /> Likes · coming soon
        </span>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act("hide")}>
          <EyeOff size={14} /> Hide
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setReporting(true)}>
          <Flag size={14} /> Report
        </Button>
        {isFounder && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={busy}
            onClick={() => void act(p.unlisted_at ? "relist" : "unlist")}
          >
            {p.unlisted_at ? "Relist" : "Unlist"}
          </Button>
        )}
      </div>
      {reporting && (
        <ReportSheet
          title="Report this preview"
          onClose={() => setReporting(false)}
          onSend={(r) => act("report", r)}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive mt-2">
          {error}
        </p>
      )}
    </article>
  );
}
