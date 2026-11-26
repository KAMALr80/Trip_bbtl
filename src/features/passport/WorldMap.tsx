// World map (deck slide 15, R-721): a pin for every trip the server lets this viewer see. Nearby
// pins cluster into a numbered bubble; zoom in to split them (and the US into states). Tap a place
// for its trips (name, room, season and year, crowns), tap a trip for its overview, and tap an
// avatar for that player's profile. Photos and answers stay with the crew: only members get the
// trip's postcard here.
import { useMemo, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorldMap, type MapTrip } from "@/data/map";
import { TripPostcard } from "@/features/postcard/TripPostcard";
import { Avatar } from "@/features/players/PlayerCards";
import { ProfileSheet } from "@/features/profile/ProfilePage";
import { useT } from "@/i18n";
import { dicebearUrl } from "@/lib/player-cards";
import { placeName } from "@/lib/places";
import { tripDisplayName } from "@/lib/trip-display-name";
import { RoomMark } from "./RoomMark";
import { clusterPins, landPath, pinPlace, type Cluster } from "./world-map";

const ZOOMS = [1, 2, 4] as const;
// The board shows latitudes 80°N to 60°S (y 10 to 150) across all longitudes.
const TOP = 10;
const WIDTH = 360;
const HEIGHT = 140;

export function WorldMap() {
  const t = useT();
  const query = useWorldMap();
  const trips = query.data ?? [];
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(1);
  const [centre, setCentre] = useState({ x: WIDTH / 2, y: TOP + HEIGHT / 2 });
  const [open, setOpen] = useState<Cluster<MapTrip> | null>(null);
  const [trip, setTrip] = useState<MapTrip | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(
    null,
  );
  const box = useRef<HTMLDivElement>(null);

  const vw = WIDTH / zoom;
  const vh = HEIGHT / zoom;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const cx = clamp(centre.x, vw / 2, WIDTH - vw / 2);
  const cy = clamp(centre.y, TOP + vh / 2, TOP + HEIGHT - vh / 2);
  const vx = cx - vw / 2;
  const vy = cy - vh / 2;

  const clusters = useMemo(() => {
    const pins = trips.flatMap((item) => {
      const place = pinPlace(item, zoom >= 2, (code) => placeName(code));
      return place ? [{ place, item }] : [];
    });
    return clusterPins(pins, 10 / zoom);
  }, [trips, zoom]);

  const setZoomAround = (next: (typeof ZOOMS)[number], x = cx, y = cy) => {
    setZoom(next);
    setCentre({ x, y });
  };

  return (
    <section className="world-map" aria-label={t("map.title")}>
      <h3 className="passport-rule-title">{t("map.title")}</h3>
      <p className="world-map-hint">{t("map.hint")}</p>
      <div
        ref={box}
        className="world-map-board"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, cx, cy, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          const el = box.current;
          if (!d || !el || zoom === 1) return;
          const dx = ((e.clientX - d.x) / el.clientWidth) * vw;
          const dy = ((e.clientY - d.y) / el.clientHeight) * vh;
          if (Math.abs(dx) + Math.abs(dy) > 0.5) d.moved = true;
          setCentre({ x: d.cx - dx, y: d.cy - dy });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerLeave={() => {
          drag.current = null;
        }}
      >
        <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} preserveAspectRatio="none" aria-hidden="true">
          <rect x={0} y={0} width={WIDTH} height={180} className="world-map-sea" />
          <path d={landPath} className="world-map-land" />
        </svg>
        {clusters.map((c) => {
          const left = ((c.x - vx) / vw) * 100;
          const top = ((c.y - vy) / vh) * 100;
          if (left < -2 || left > 102 || top < -2 || top > 102) return null;
          const count = c.items.length;
          const home = count === 1 && c.items[0]?.kind === "postcard";
          return (
            <button
              key={`${c.places.join("|")}-${Math.round(c.x)}-${Math.round(c.y)}`}
              type="button"
              className={`world-map-pin ${count > 1 ? "is-cluster" : ""}`}
              style={{ left: `${left}%`, top: `${top}%` }}
              aria-label={t("map.pinLabel", { count, places: c.places.join(", ") })}
              onClick={() => {
                if (drag.current?.moved) return;
                setTrip(null);
                setOpen(c);
              }}
            >
              {count > 1 ? count : home ? "🏠" : ""}
            </button>
          );
        })}
        <div className="world-map-zoom">
          <Button
            variant="secondary"
            size="icon"
            aria-label={t("map.zoomIn")}
            disabled={zoom === 4}
            onClick={() => setZoomAround(zoom === 1 ? 2 : 4)}
          >
            <Plus aria-hidden />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            aria-label={t("map.zoomOut")}
            disabled={zoom === 1}
            onClick={() => setZoomAround(zoom === 4 ? 2 : 1)}
          >
            <Minus aria-hidden />
          </Button>
        </div>
      </div>
      {query.isLoading && (
        <p className="mt-2 text-xs" role="status">
          {t("map.loading")}
        </p>
      )}
      {query.isError && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {t("map.error")}
        </p>
      )}
      {query.isSuccess && trips.length === 0 && (
        <p className="world-map-hint mt-2">{t("map.empty")}</p>
      )}

      {open && (
        <div className="world-map-panel" role="region" aria-label={open.places.join(", ")}>
          <div className="flex items-start justify-between gap-2">
            <p className="font-display text-base font-extrabold">
              {t("map.placeTitle", { places: open.places.join(" · "), count: open.items.length })}
            </p>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("map.close")}
              onClick={() => {
                setOpen(null);
                setTrip(null);
              }}
            >
              <X aria-hidden />
            </Button>
          </div>
          {open.places.length > 1 && zoom < 4 && (
            <Button
              variant="link"
              className="h-auto min-h-6 p-0 text-xs"
              onClick={() => setZoomAround(zoom === 1 ? 2 : 4, open.x, open.y)}
            >
              {t("map.zoomHere")}
            </Button>
          )}
          {!trip && (
            <ul className="mt-2 grid gap-1">
              {open.items.map((item) => (
                <li key={item.trip_id}>
                  <button type="button" className="world-map-trip" onClick={() => setTrip(item)}>
                    <RoomMark room={item.room} />
                    <span className="min-w-0 flex-1 truncate">
                      <strong>{tripDisplayName(item.trip_name)}</strong>
                      <small>
                        {item.season_label}
                        {item.crowns.length > 0 ? ` · ${"👑".repeat(item.crowns.length)}` : ""}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {trip && (
            <div className="mt-2">
              <Button variant="ghost" className="min-h-11 px-0" onClick={() => setTrip(null)}>
                ← {t("map.back")}
              </Button>
              <p className="font-display text-lg font-extrabold">
                <RoomMark room={trip.room} /> {tripDisplayName(trip.trip_name)}
              </p>
              <p className="text-xs text-muted-foreground">
                {trip.season_label}
                {trip.crowns.length > 0 ? ` · ${"👑".repeat(trip.crowns.length)}` : ""}
              </p>
              <p className="mt-3 text-xs font-bold uppercase text-muted-foreground">
                {t("map.crew")}
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {trip.players.map((p) => (
                  <button
                    key={p.user_id}
                    type="button"
                    className="world-map-player"
                    onClick={() => setProfile(p.user_id)}
                    aria-label={t("map.openProfile", { name: p.game_name ?? t("player.former") })}
                  >
                    <Avatar
                      url={dicebearUrl(p.avatar_style ?? "street", p.avatar_seed || p.user_id)}
                      name={p.game_name ?? t("player.former")}
                      className="size-10"
                    />
                    <small>{p.game_name ?? t("player.former")}</small>
                  </button>
                ))}
              </div>
              {trip.member ? (
                <div className="mt-3">
                  <TripPostcard
                    trip={{
                      id: trip.trip_id,
                      name: trip.trip_name,
                      destination: placeName(trip.culture ?? trip.country),
                      start_date: "",
                      end_date: "",
                      cultures: trip.culture ? [trip.culture] : [],
                    }}
                  />
                </div>
              ) : (
                <p className="world-map-hint mt-3">{t("map.crewOnly")}</p>
              )}
            </div>
          )}
        </div>
      )}
      {profile && <ProfileSheet userId={profile} tripId={null} onClose={() => setProfile(null)} />}
    </section>
  );
}
