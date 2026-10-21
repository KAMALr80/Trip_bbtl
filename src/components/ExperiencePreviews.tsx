import { useCallback, useEffect, useState, type ReactElement } from "react";
import { EyeOff, Flag, Heart, Plane, Home, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { COUNTRIES, countryName, placeLabel } from "@/lib/places";
import { PlaceBrowser, type PlaceItem } from "./PlaceBrowser";
import { ReportSheet } from "./ReportSheet";

const db = supabase as unknown as {
  rpc: (f: string, a?: object) => PromiseLike<{ data: any; error: { message: string } | null }>;
  from: (t: string) => any;
};

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
const PACK_OF: Record<string, string> = { TH: "thailand", MX: "mexico", JP: "japan" };

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
    void db
      .rpc("my_preview_shared", { p_trip: tripId ?? null, p_exp: expId ?? null })
      .then(({ data }) => setOn(!!data));
  }, [tripId, expId]);
  async function change(value: boolean) {
    setBusy(true);
    setError("");
    const { data, error: e } = await db.rpc("share_preview", {
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
    const { error: e } = await db.rpc("preview_action", {
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

type Item = PlaceItem & { p: Preview };
const previewGroups: [string, Preview["kind"][], typeof Plane][] = [
  ["Trips", ["trip"], Plane],
  ["At Home", ["at_home"], Home],
  ["Culture stories", ["culture_home", "culture_travel"], Sparkles],
];
function DestinationPage({
  list,
  isFounder,
  onStartTrip,
  onTryAtHome,
  onOpenCulture,
  onChanged,
}: {
  list: Item[];
  isFounder?: boolean | undefined;
  onStartTrip?: (destination: string) => void;
  onTryAtHome?: (pack: string) => void;
  onOpenCulture?: () => void;
  onChanged: () => void;
}) {
  const first = list[0]!;
  const name =
    first.city || first.region || (first.country ? countryName(first.country) : "this place");
  const squads = list.filter((i) => i.p.kind === "trip" || i.p.kind === "at_home").length;
  const dest = [first.city, first.country ? countryName(first.country) : null]
    .filter(Boolean)
    .join(", ");
  const pack = first.country ? PACK_OF[first.country] : undefined;
  return (
    <div className="min-w-0">
      <h3 className="font-display text-xl font-extrabold">
        {squads} {squads === 1 ? "squad has" : "squads have"} been to {name}
      </h3>
      <div className="grid grid-cols-2 gap-2 mt-3">
        {onStartTrip && (
          <Button variant="playful" className="rounded-full" onClick={() => onStartTrip(dest)}>
            Start a trip like this
          </Button>
        )}
        {onTryAtHome && (
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => onTryAtHome(pack ?? "")}
          >
            Try this At Home
          </Button>
        )}
      </div>
      {previewGroups.map(([label, kinds, Icon]) => {
        const g = list.filter((i) => kinds.includes(i.p.kind));
        return g.length ? (
          <section key={label} className="mt-5">
            <h4 className="font-bold flex items-center gap-2">
              <Icon size={16} /> {label}
            </h4>
            {g.map((i) => (
              <PreviewCard
                key={i.id}
                p={i.p}
                isFounder={isFounder}
                onChanged={onChanged}
                {...(onOpenCulture ? { onOpenCulture } : {})}
              />
            ))}
          </section>
        ) : null;
      })}
    </div>
  );
}
/** Leaderboards › Destinations — read-only, all ages, built only from shared previews of ended experiences. */
export function Destinations({
  isFounder,
  onStartTrip,
  onTryAtHome,
  onOpenCulture,
}: {
  isFounder?: boolean | undefined;
  onStartTrip?: (destination: string) => void;
  onTryAtHome?: (pack: string) => void;
  onOpenCulture?: () => void;
}) {
  const [rows, setRows] = useState<Preview[]>([]),
    [hidden, setHidden] = useState<Set<string>>(new Set());
  const load = useCallback(() => {
    void Promise.all([
      db
        .from("experience_previews")
        .select(
          "id,kind,country,region,city,month_year,length_days,vibe,squad_size,games_played,checkin_done,takeoff_done,task_titles,game_nights,stamps_earned,culture_public,unlisted_at,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(500),
      db.from("preview_hidden").select("preview_id"),
    ]).then(([a, b]: { data: any }[]) => {
      setRows((a?.data ?? []) as Preview[]);
      setHidden(new Set(((b?.data ?? []) as { preview_id: string }[]).map((r) => r.preview_id)));
    });
  }, []);
  useEffect(load, [load]);
  const items: Item[] = rows
    .filter((p) => !hidden.has(p.id) && (isFounder || !p.unlisted_at))
    .map((p) => ({
      id: p.id,
      title: KIND[p.kind],
      country: countryCodeOf(p.country),
      region: p.region,
      city: p.city,
      p,
    }));
  return (
    <section className="min-w-0">
      <p className="mt-4 text-sm text-muted-foreground">
        Text-only previews from finished trips and experiences whose Captain or creator chose to
        share. No photos, names or dates.
      </p>
      {items.length === 0 && (
        <p className="mt-3 text-sm">
          No destinations yet — they appear once a squad shares a preview.
        </p>
      )}
      <PlaceBrowser
        items={items}
        noun="preview"
        headline="Destinations"
        renderItem={(i) => (
          <PreviewCard
            key={i.id}
            p={i.p}
            isFounder={isFounder}
            onChanged={load}
            {...(onOpenCulture ? { onOpenCulture } : {})}
          />
        )}
        renderEmpty={() => <p className="text-sm text-muted-foreground">No previews here yet.</p>}
      />
      {items.length > 0 && (
        <DestinationIndex
          items={items}
          Page={({ list }) => (
            <DestinationPage
              list={list}
              isFounder={isFounder}
              onChanged={load}
              {...(onStartTrip ? { onStartTrip } : {})}
              {...(onTryAtHome ? { onTryAtHome } : {})}
              {...(onOpenCulture ? { onOpenCulture } : {})}
            />
          )}
        />
      )}
    </section>
  );
}

function DestinationIndex({
  items,
  Page,
}: {
  items: Item[];
  Page: (props: { list: Item[] }) => ReactElement;
}) {
  const keys = Array.from(new Set(items.map((i) => `${i.country ?? ""}|${i.city ?? ""}`)));
  const [open, setOpen] = useState<string | null>(null);
  const list = open ? items.filter((i) => `${i.country ?? ""}|${i.city ?? ""}` === open) : [];
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-extrabold">Destination pages</h2>
      <div className="flex flex-wrap gap-2 mt-3">
        {keys.map((k) => {
          const [c, city] = k.split("|");
          return (
            <Button
              key={k}
              size="sm"
              variant={open === k ? "playful" : "outline"}
              className="rounded-full"
              onClick={() => setOpen(open === k ? null : k)}
            >
              {[city, c ? countryName(c) : "Somewhere"].filter(Boolean).join(", ")}
            </Button>
          );
        })}
      </div>
      {open && list.length > 0 && (
        <div className="mt-4">
          <Page list={list} />
        </div>
      )}
    </section>
  );
}

type Rank = {
  tier: string;
  points: number;
  next_tier: string | null;
  next_at: number | null;
  tier_at: number;
  passport_junkie: boolean;
};
/** Junkie Rank — server-calculated activity rank (never mixed with game scores), plus the single Passport Junkie 👑 badge. */
export function JunkieRankBadge({
  userId,
  progress = false,
}: {
  userId: string;
  progress?: boolean;
}) {
  const [rank, setRank] = useState<Rank | null>(null);
  useEffect(() => {
    let live = true;
    void db.rpc("junkie_rank", { p_user: userId }).then(({ data }) => {
      if (live) setRank((data as Rank[] | null)?.[0] ?? null);
    });
    return () => {
      live = false;
    };
  }, [userId]);
  if (!rank) return null;
  const pct = rank.next_at
    ? Math.min(
        100,
        Math.max(0, ((rank.points - rank.tier_at) / (rank.next_at - rank.tier_at)) * 100),
      )
    : 100;
  return (
    <span className={progress ? "block w-full" : "inline-flex flex-wrap gap-1.5"}>
      <span className="inline-flex flex-wrap gap-1.5">
        <span
          className="passport-stamp inline-flex border-blue text-blue px-3 py-1 text-xs font-extrabold uppercase"
          aria-label={`Junkie Rank: ${rank.tier}`}
        >
          ✈ {rank.tier}
        </span>
        {rank.passport_junkie && (
          <span
            className="passport-stamp inline-flex border-orange text-orange px-3 py-1 text-xs font-extrabold"
            aria-label="Passport Junkie badge"
          >
            Passport Junkie 👑
          </span>
        )}
      </span>
      {progress && (
        <span className="block mt-2">
          <span
            className="block h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            aria-label="Progress to next Junkie Rank tier"
          >
            <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </span>
          <span className="block text-xs mt-1 text-muted-foreground">
            {rank.points} rank points
            {rank.next_tier && rank.next_at
              ? ` · ${rank.next_at - rank.points} to ${rank.next_tier}`
              : " · top tier"}
          </span>
        </span>
      )}
    </span>
  );
}

export function JunkieRewards() {
  const list = [
    ["Frequent Flyer", "+10 AI credits"],
    ["First Class", "Free At Home experience"],
    ["Jet Setter", "Free trip unlock"],
    ["World Class 👑", "TripJunkies merch pack"],
  ];
  return (
    <div>
      <p className="text-sm font-bold">Junkie Rank rewards</p>
      <ul className="mt-2 space-y-1">
        {list.map(([t, r]) => (
          <li key={t} className="flex justify-between gap-2 text-sm opacity-70">
            <span>
              {t} · {r}
            </span>
            <span className="text-xs font-bold">Coming soon</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
