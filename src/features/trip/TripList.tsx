import { rpc } from "@/data/rpc";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShortList } from "@/components/ShortList";

import { TripSectionIcon } from "@/features/trip/TripSectionIcon";
import { supabase } from "@/integrations/supabase/client";
import type { TripWithRole } from "@/lib/trips";
import { tripDisplayName } from "@/lib/trip-display-name";
import { TripActions } from "@/features/trip/TripActions";
import { dayIn, orderTrips, tripStatus } from "@/features/trip/trip-order";

type Peek = {
  kind: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  squad: number;
  nights_played: number;
  top: { name: string; score: number }[];
};
type Past = { trip_id: string; name: string; start_date: string; end_date: string };
const fmt = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const addDays = (d: string, n: number) =>
  new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export { tripStatus };

/** Read-only peek for waiting or former members (server returns only these fields). */
export function TripPeekCard({ peek }: { peek: Peek }) {
  return (
    <div className="app-card">
      <p className="eyebrow">
        {peek.kind === "waiting" ? "WAITING FOR YOUR CAPTAIN" : "READ-ONLY PREVIEW"}
      </p>
      <h2 className="font-display text-xl font-extrabold mt-1 truncate">
        {tripDisplayName(peek.name)}
      </h2>
      <p className="text-sm text-muted-foreground truncate">
        {peek.destination} · {fmt(peek.start_date)} – {fmt(peek.end_date)}
      </p>
      <p className="text-sm mt-2">
        {peek.squad} in the squad · {peek.nights_played} game night
        {peek.nights_played === 1 ? "" : "s"} played
      </p>
      {peek.top.length > 0 && (
        <ol className="mt-3 divide-y divide-border border-y border-border">
          {peek.top.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate font-bold">
                {i + 1}. {r.name}
              </span>
              <span className="font-display font-extrabold">{r.score}</span>
            </li>
          ))}
        </ol>
      )}
      {peek.kind === "waiting" && (
        <p className="text-xs text-muted-foreground mt-3">
          You'll see the whole trip once your Captain approves you.
        </p>
      )}
    </div>
  );
}

export function TripList({
  trips,
  onSelect,
  id,
  onChanged,
}: {
  trips: TripWithRole[];
  onSelect: (id: string) => void;
  id: string;
  onChanged?: () => void | Promise<void>;
}) {
  const [earned, setEarned] = useState<Set<string>>(new Set());
  const [hasHome, setHasHome] = useState(true);
  const [past, setPast] = useState<Past[]>([]);
  const [peek, setPeek] = useState<Peek | null>(null);
  useEffect(() => {
    let live = true;
    void supabase.rpc("passport_collection").then(({ data, error }) => {
      if (live && !error) setEarned(new Set((data ?? []).map((stamp) => stamp.trip_id)));
    });
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user)
        void supabase
          .from("player_profiles")
          .select("home_country")
          .eq("user_id", data.user.id)
          .maybeSingle()
          .then(({ data: p }: { data: { home_country?: string | null } | null }) => {
            if (live) setHasHome(!!p?.home_country);
          });
    });
    void rpc("my_past_trips").then(({ data }) => {
      if (live) setPast(data ?? []);
    });
    return () => {
      live = false;
    };
  }, [trips]);
  const stampLabel = (t: TripWithRole) => {
    if (t.kind === "at_home") return "Postcard";
    if (tripStatus(t) !== "Completed") return "";
    if (earned.has(t.id)) return "Stamped";
    if (!hasHome) return "Add your home country to earn stamps";
    return dayIn(t.home_timezone) <= addDays(t.end_date, 2) || t.ended_at ? "Stamp on the way" : "";
  };
  const ordered = orderTrips(trips);
  return (
    <div className="cinematic-trip-list">
      <div className="divide-y divide-border border-y border-border">
        <ShortList items={ordered} id={id} limit={4}>
          {(t) => {
            const label = stampLabel(t);
            return (
              <div key={t.id} className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  className="flex h-auto min-h-16 min-w-0 flex-1 items-center justify-between gap-3 rounded-none px-1 text-left"
                  onClick={() => onSelect(t.id)}
                >
                  <span className="min-w-0 flex-1">
                    <strong className="flex min-w-0 items-center gap-1 font-display">
                      <TripSectionIcon trip={t} />
                      <span className="min-w-0 truncate">{tripDisplayName(t.name)}</span>
                    </strong>
                    <small className="block truncate text-muted-foreground">
                      <span className="font-bold text-foreground">
                        {t.myRole === "captain" ? "Captain" : "Player"}
                      </span>{" "}
                      · {label ? `${label} · ` : ""}
                      {fmt(t.start_date)} · {tripStatus(t)}
                    </small>
                  </span>
                  <ArrowRight className="size-4 shrink-0" />
                </Button>
                {onChanged && <TripActions trip={t} onDone={onChanged} />}
              </div>
            );
          }}
        </ShortList>
      </div>
      {past.length > 0 && (
        <div className="mt-4">
          <p className="eyebrow mb-1">PAST SQUADS</p>
          <div className="divide-y divide-border border-y border-border">
            {past.map((p) => (
              <Button
                key={p.trip_id}
                variant="ghost"
                className="flex h-auto min-h-14 w-full items-center justify-between gap-3 rounded-none px-1 text-left"
                onClick={() =>
                  void rpc("trip_peek", { p_trip: p.trip_id }).then(
                    ({ data }) => data && setPeek(data as Peek),
                  )
                }
              >
                <span className="min-w-0 flex-1">
                  <strong className="block truncate font-display">{tripDisplayName(p.name)}</strong>
                  <small className="block truncate text-muted-foreground">
                    {fmt(p.start_date)} · Read-only
                  </small>
                </span>
                <ArrowRight className="size-4 shrink-0" />
              </Button>
            ))}
          </div>
        </div>
      )}
      {peek && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center">
          <div className="absolute inset-0 bg-foreground/60" onClick={() => setPeek(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Trip preview"
            className="relative w-full max-w-lg p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          >
            <TripPeekCard peek={peek} />
            <Button variant="outline" className="w-full mt-3 bg-card" onClick={() => setPeek(null)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
