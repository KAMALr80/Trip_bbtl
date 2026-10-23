import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
const portraits = import.meta.glob("../assets/avatars/traveler-*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
export const premadeAvatars = Object.keys(portraits)
  .sort(
    (a, b) =>
      Number(a.match(/traveler-(\d+)\.webp$/)?.[1] ?? 0) -
      Number(b.match(/traveler-(\d+)\.webp$/)?.[1] ?? 0),
  )
  .map((key) => portraits[key]);
const buddies = import.meta.glob("../assets/avatars/buddy-*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
export const buddyAvatars = Object.keys(buddies)
  .sort()
  .map((key) => buddies[key]!);

export type PlayerCard = Pick<
  Tables<"trip_player_cards">,
  "trip_id" | "user_id" | "game_name" | "avatar_style" | "avatar_seed" | "avatar_path"
> &
  Partial<
    Pick<
      Tables<"trip_player_cards">,
      | "real_name"
      | "hometown"
      | "occupation"
      | "fun_fact"
      | "most_excited"
      | "trip_persona"
      | "next_year_goal"
      | "pronouns"
      | "stamp_count"
    >
  >;
export type PlayerWithAvatar = PlayerCard & { avatarUrl: string };
export const avatarStyles = ["street", "crew", "hero"] as const;
export function dicebearUrl(style: string, seed: string) {
  if (style === "traveler" && /^([1-9]|1\d|2[0-4])$/.test(seed))
    return premadeAvatars[Number(seed) - 1]!;
  if (style === "traveler" && /^(2[5-9]|3\d|4\d|5[0-4])$/.test(seed))
    return buddyAvatars[Number(seed) - 25]!;
  if (style === "traveler" && /^(5[5-9]|60)$/.test(seed)) return premadeAvatars[Number(seed) - 31]!;
  // Pick-only avatars: older saved styles resolve to a built-in portrait, never an outside service.
  const all = [...premadeAvatars.slice(0, 24), ...buddyAvatars];
  let h = 0;
  for (const ch of `${style}:${seed}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return all[h % all.length]!;
}
export function makeSeed() {
  return crypto.randomUUID().slice(0, 12);
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
