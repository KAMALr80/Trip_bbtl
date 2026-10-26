import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PlayerWithAvatar } from "@/lib/player-cards";
import type { TripWithRole } from "@/lib/trips";
import { AvatarButton } from "@/features/players/PlayerCards";

// M1-01: the one read-only view for trips archived at the new-engine cutover (rules_version = 1).
// Overview, crew, crowns already won, photos (until purge) and the viewer's stamp. Every write is
// refused on the server (trip_private.guard_archived_trip), so this view offers no actions.

type Crown = { season: string; user_id: string };
type Stamp = { country: string; state: string | null; city: string | null; stamped_on: string };

const seasonLabel: Record<string, string> = {
  game: "Game Season",
  trip: "Trip Season",
  home: "At Home",
};

const fmtDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

export function ArchivedTrip({
  trip,
  cards,
  userId,
  onMember,
}: {
  trip: TripWithRole;
  cards: PlayerWithAvatar[];
  userId: string;
  onMember: (id: string) => void;
}) {
  const [crowns, setCrowns] = useState<Crown[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [stamp, setStamp] = useState<Stamp | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [champions, photoRows, stamps] = await Promise.all([
        supabase.from("season_champions").select("season,user_id").eq("trip_id", trip.id),
        supabase.rpc("trip_photos", { p_trip: trip.id }),
        supabase
          .from("passport_stamps")
          .select("country,state,city,stamped_on")
          .eq("trip_id", trip.id)
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      if (!active) return;
      setCrowns(champions.data ?? []);
      setStamp(stamps.data ?? null);
      const paths = [...new Set((photoRows.data ?? []).map((p) => p.photo_path))].slice(0, 24);
      if (!paths.length) return;
      const { data } = await supabase.storage.from("trip-photos").createSignedUrls(paths, 3600);
      if (active) setPhotos((data ?? []).flatMap((x) => (x.signedUrl ? [x.signedUrl] : [])));
    })();
    return () => {
      active = false;
    };
  }, [trip.id, userId]);

  const nameOf = (id: string) => cards.find((c) => c.user_id === id)?.game_name ?? "A player";

  return (
    <section aria-labelledby="archived-trip-title" className="space-y-5">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Archived trip
        </p>
        <h1 id="archived-trip-title" className="font-display text-2xl font-extrabold">
          {trip.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {trip.destination} · {fmtDay(trip.start_date)} – {fmtDay(trip.end_date)}
        </p>
      </header>

      <div className="rounded-2xl bg-muted p-4 text-sm" role="note">
        <p className="font-bold">This trip was played on an earlier version of TripJunkies.</p>
        <p className="mt-1 text-muted-foreground">
          You can look back at it any time, but nothing here can be changed. Your stamps and crowns
          stay on your passport.
        </p>
      </div>

      <div>
        <h2 className="font-display text-lg font-bold">Crew</h2>
        <ul className="mt-2 flex flex-wrap gap-3">
          {cards.map((card) => (
            <li key={card.user_id} className="flex flex-col items-center gap-1 text-xs">
              <AvatarButton
                userId={card.user_id}
                url={card.avatarUrl}
                name={card.game_name}
                onOpen={onMember}
              />
              <span>{card.game_name}</span>
            </li>
          ))}
        </ul>
      </div>

      {crowns.length > 0 && (
        <div>
          <h2 className="font-display text-lg font-bold">Crowns</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {crowns.map((crown) => (
              <li key={`${crown.season}-${crown.user_id}`}>
                👑 {seasonLabel[crown.season] ?? crown.season}: {nameOf(crown.user_id)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {stamp && (
        <div>
          <h2 className="font-display text-lg font-bold">Your stamp</h2>
          <p className="mt-1 text-sm">
            🛂 {[stamp.city, stamp.state, stamp.country].filter(Boolean).join(", ")} ·{" "}
            {fmtDay(stamp.stamped_on)}
          </p>
        </div>
      )}

      {photos.length > 0 && (
        <div>
          <h2 className="font-display text-lg font-bold">Photos</h2>
          <ul className="mt-2 grid grid-cols-3 gap-2">
            {photos.map((url, i) => (
              <li key={url}>
                <img
                  src={url}
                  alt={`Trip photo ${i + 1} of ${photos.length}`}
                  loading="lazy"
                  className="aspect-square w-full rounded-xl object-cover"
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
