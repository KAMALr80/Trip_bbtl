// Trip, roster and player-card reads (M1-05). Screens use the Query hooks in ./queries.ts; these
// loaders are the functions behind them.
import { supabase } from "@/integrations/supabase/client";
import type { Member, TripWithRole } from "@/lib/trips";
import { dicebearUrl, type PlayerCard, type PlayerWithAvatar } from "@/lib/player-cards";

export async function loadTrips(userId: string): Promise<TripWithRole[]> {
  const { data: memberships, error } = await supabase
    .from("trip_members")
    .select("trip_id,role")
    .eq("user_id", userId);
  if (error) throw error;
  if (!memberships?.length) return [];
  const { data: trips, error: tripError } = await supabase
    .from("trips")
    .select("*")
    .in(
      "id",
      memberships.map((m) => m.trip_id),
    );
  if (tripError) throw tripError;
  return (trips ?? [])
    .map((trip) => ({
      ...trip,
      myRole: memberships.find((m) => m.trip_id === trip.id)?.role ?? "player",
    }))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
}

/** My memberships as `trip:status` pairs, to notice being removed, approved or leaving. */
export async function loadMembershipSignature(userId: string): Promise<string> {
  const { data } = await supabase
    .from("trip_members")
    .select("trip_id,status")
    .eq("user_id", userId);
  return (data ?? [])
    .map((m) => `${m.trip_id}:${m.status}`)
    .sort()
    .join(",");
}

export async function loadMembers(tripId: string): Promise<Member[]> {
  const { data, error } = await supabase.rpc("trip_roster", { p_trip: tripId });
  if (error) throw error;
  return data ?? [];
}

export async function avatarUrl(card: PlayerCard) {
  if (card.avatar_style === "photo" && card.avatar_path) {
    const { data } = await supabase.storage
      .from("player-avatars")
      .createSignedUrl(card.avatar_path, 3600);
    if (data?.signedUrl) return data.signedUrl;
  }
  return dicebearUrl(card.avatar_style, card.avatar_seed || card.user_id);
}

export async function loadCards(tripId: string): Promise<PlayerWithAvatar[]> {
  const [{ data, error }, { data: auth }] = await Promise.all([
    supabase
      .from("trip_player_cards")
      .select("trip_id,user_id,game_name,avatar_style,avatar_seed,avatar_path")
      .eq("trip_id", tripId),
    supabase.auth.getUser(),
  ]);
  if (error) throw error;
  const ownId = auth.user?.id;
  const own = ownId
    ? await supabase
        .from("trip_player_cards")
        .select("*")
        .eq("trip_id", tripId)
        .eq("user_id", ownId)
        .maybeSingle()
    : { data: null };
  return Promise.all(
    (data ?? []).map(async (card) => {
      const merged = own.data?.user_id === card.user_id ? { ...card, ...own.data } : card;
      return { ...merged, avatarUrl: await avatarUrl(merged) };
    }),
  );
}
