// Passport Junkie profile (M5-10) and the player's own profile settings (M5-11).
// The server decides what a viewer may see (trip_private.player_profile); this only reads it.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "@/lib/zod-setup";
import { supabase } from "@/integrations/supabase/client";
import { dicebearUrl } from "@/lib/player-cards";
import { rpc } from "./rpc";

export const profileKeys = {
  profile: (userId: string, tripId: string | null) => ["profile", userId, tripId ?? ""] as const,
  prefs: ["profile-prefs"] as const,
};

const level = z.enum(["none", "tourist", "explorer", "voyager", "globetrotter", "passport_junkie"]);
const profileStamp = z.object({
  trip_id: z.string(),
  kind: z.string(),
  country: z.string(),
  state: z.string().nullable(),
  city: z.string().nullable(),
  culture: z.string().nullable(),
  stamped_on: z.string(),
  season_label: z.string(),
  room: z.string(),
  solo: z.boolean(),
  crowns: z.array(z.string()),
  trip_name: z.string(),
  top: z.boolean(),
  hidden: z.boolean(),
  has_postcard: z.boolean(),
});
const playerProfile = z.object({
  user_id: z.string(),
  game_name: z.string(),
  avatar_style: z.string(),
  avatar_seed: z.string(),
  avatar_path: z.string().nullable(),
  level,
  stars: z.number(),
  countries: z.number(),
  is_public: z.boolean(),
  self: z.boolean(),
  crew: z.boolean(),
  private: z.boolean(),
  about_me: z.string().nullable().optional(),
  from: z.string().nullable().optional(),
  this_trip: z
    .object({
      trip_id: z.string(),
      trip_name: z.string(),
      role: z.string(),
      persona: z.string().nullable(),
      most_excited: z.string().nullable(),
    })
    .nullable()
    .optional(),
  badges: z.array(z.object({ badge: z.string(), tier: z.number() })).optional(),
  stamps: z.array(profileStamp).optional(),
});
export type PlayerProfile = z.infer<typeof playerProfile> & { avatarUrl: string };
export type ProfileStamp = z.infer<typeof profileStamp>;

/** Someone's profile as this viewer may see it (R-714), or null if they have none yet. */
export function usePlayerProfile(userId: string, tripId: string | null) {
  return useQuery({
    queryKey: profileKeys.profile(userId, tripId),
    queryFn: async (): Promise<PlayerProfile | null> => {
      const { data, error } = await rpc("player_profile", { p_user: userId, p_trip: tripId });
      if (error) throw error;
      if (!data) return null;
      const p = playerProfile.parse(data);
      let avatarUrl = dicebearUrl(p.avatar_style, p.avatar_seed || p.user_id);
      if (p.avatar_style === "photo" && p.avatar_path) {
        const { data: signed } = await supabase.storage
          .from("player-avatars")
          .createSignedUrl(p.avatar_path, 3600);
        if (signed?.signedUrl) avatarUrl = signed.signedUrl;
      }
      return { ...p, avatarUrl };
    },
    staleTime: 60_000,
  });
}

/** My own settings: public / private, About me, top stamps, hidden trips. */
export function useMyProfilePrefs() {
  return useQuery({
    queryKey: profileKeys.prefs,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_prefs")
        .select("is_public, about_me, top_stamps, hidden_trips")
        .maybeSingle();
      if (error) throw error;
      return data ?? { is_public: false, about_me: null, top_stamps: [], hidden_trips: [] };
    },
    staleTime: 60_000,
  });
}

export function useProfileActions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      action:
        | { type: "profile"; isPublic: boolean; about: string; from: string | null }
        | { type: "top"; trips: string[] }
        | { type: "hide"; tripId: string; hidden: boolean },
    ) => {
      const { error } =
        action.type === "profile"
          ? await rpc("set_profile", {
              p_public: action.isPublic,
              p_about: action.about,
              p_from: action.from,
            })
          : action.type === "top"
            ? await rpc("set_top_stamps", { p_trips: action.trips })
            : await rpc("set_trip_hidden", { p_trip: action.tripId, p_hidden: action.hidden });
      if (error) throw error;
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: profileKeys.prefs }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
        queryClient.invalidateQueries({ queryKey: ["account"] }),
      ]),
  });
}
