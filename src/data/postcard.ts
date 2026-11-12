// Postcard Picks, wrap-up week, the Captain's tie-break / swap and the locked Trip Postcard
// (M5-01 – M5-06), plus the player's stamps, level and badges (M5-07 – M5-09).
// The server decides every rule; these hooks only call and read.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "@/lib/zod-setup";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { rpc } from "./rpc";

export const postcardKeys = {
  info: (tripId: string) => ["trip", tripId, "postcard-info"] as const,
  picks: (tripId: string) => ["trip", tripId, "postcard-picks"] as const,
  board: (tripId: string) => ["trip", tripId, "wrapup-board"] as const,
  answers: (tripId: string) => ["trip", tripId, "wrapup-answers"] as const,
  ranking: (tripId: string) => ["trip", tripId, "postcard-ranking"] as const,
  postcard: (tripId: string) => ["trip", tripId, "postcard"] as const,
  stamps: ["passport", "stamps"] as const,
  progress: ["passport", "progress"] as const,
};

const wrapupQuestion = z.object({ key: z.string(), question: z.string(), emoji: z.boolean() });
const postcardInfo = z.object({
  picks: z.number(),
  kept: z.number(),
  solo: z.boolean(),
  picks_close_at: z.string().nullable(),
  locks_at: z.string().nullable(),
  questions: z.array(wrapupQuestion),
});
export type WrapupQuestion = z.infer<typeof wrapupQuestion>;
export type PostcardInfo = z.infer<typeof postcardInfo>;

/** Signed links for photos in quest-proofs; a photo the viewer may not see just has no link. */
async function signPhotos(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  if (!list.length) return new Map();
  try {
    const { data } = await supabase.storage.from("quest-proofs").createSignedUrls(list, 3600);
    return new Map(
      (data ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])),
    );
  } catch {
    return new Map(); // photos show as blanks; the rest of the screen still works
  }
}

export function usePostcardInfo(tripId: string, enabled = true) {
  return useQuery({
    enabled,
    queryKey: postcardKeys.info(tripId),
    queryFn: async (): Promise<PostcardInfo> => {
      const { data, error } = await rpc("postcard_info", { p_trip: tripId });
      if (error) throw error;
      return postcardInfo.parse(data);
    },
    staleTime: 5 * 60_000,
  });
}

/** The proofs I nominated. */
export function useMyPicks(tripId: string) {
  return useQuery({
    queryKey: postcardKeys.picks(tripId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("postcard_picks")
        .select("proof_id, picked_at")
        .eq("trip_id", tripId);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}

/** My photos for this trip that can go on the postcard, with signed links. */
export function useMyTripPhotos(tripId: string) {
  return useQuery({
    queryKey: ["trip", tripId, "my-photos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proofs")
        .select("id, photo_path, crew_status, photo_removed_at, created_at")
        .eq("trip_id", tripId)
        .not("photo_path", "is", null)
        .is("photo_removed_at", null)
        .neq("crew_status", "expired")
        .order("created_at");
      if (error) throw error;
      const urls = await signPhotos((data ?? []).map((p) => p.photo_path));
      return (data ?? []).map((p) => ({ ...p, url: urls.get(p.photo_path ?? "") ?? null }));
    },
    staleTime: 60_000,
  });
}

export function usePickPostcard(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ proofId, pick }: { proofId: string; pick: boolean }) => {
      const { data, error } = await rpc("pick_postcard", {
        p_trip: tripId,
        p_proof: proofId,
        p_pick: pick,
      });
      if (error) throw error;
      return data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: postcardKeys.picks(tripId) }),
  });
}

export type BoardPhoto = Database["public"]["Functions"]["wrapup_board"]["Returns"][number] & {
  url: string | null;
};

/** Wrap-up week: the crew's picks in a shuffled order, mine flagged, my hearts. */
export function useWrapupBoard(tripId: string, enabled = true) {
  return useQuery({
    queryKey: postcardKeys.board(tripId),
    queryFn: async (): Promise<BoardPhoto[]> => {
      const { data, error } = await rpc("wrapup_board", { p_trip: tripId });
      if (error) throw error;
      const urls = await signPhotos((data ?? []).map((r) => r.photo_path));
      return (data ?? []).map((r) => ({ ...r, url: urls.get(r.photo_path) ?? null }));
    },
    staleTime: 30_000,
    enabled,
  });
}

export function useHeartPhoto(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ proofId, on }: { proofId: string; on: boolean }) => {
      const { error } = await rpc("heart_photo", { p_trip: tripId, p_proof: proofId, p_on: on });
      if (error) throw error;
    },
    onMutate: async ({ proofId, on }) => {
      await queryClient.cancelQueries({ queryKey: postcardKeys.board(tripId) });
      queryClient.setQueryData<BoardPhoto[]>(postcardKeys.board(tripId), (rows) =>
        rows?.map((r) => (r.proof_id === proofId ? { ...r, hearted: on } : r)),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: postcardKeys.board(tripId) }),
  });
}

export function useMyWrapupAnswers(tripId: string, enabled = true) {
  return useQuery({
    enabled,
    queryKey: postcardKeys.answers(tripId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wrapup_answers")
        .select("question_key, answer")
        .eq("trip_id", tripId);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((a) => [a.question_key, a.answer]));
    },
    staleTime: 60_000,
  });
}

export function useAnswerWrapup(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, answer }: { key: string; answer: string }) => {
      const { error } = await rpc("answer_wrapup", {
        p_trip: tripId,
        p_key: key,
        p_answer: answer,
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: postcardKeys.answers(tripId) }),
  });
}

export type RankedPhoto = Database["public"]["Functions"]["postcard_ranking"]["Returns"][number] & {
  url: string | null;
};

/** Leaders only: the ranking with heart counts, the cut, ties and the swap. */
export function usePostcardRanking(tripId: string, enabled: boolean) {
  return useQuery({
    queryKey: postcardKeys.ranking(tripId),
    queryFn: async (): Promise<RankedPhoto[]> => {
      const { data, error } = await rpc("postcard_ranking", { p_trip: tripId });
      if (error) throw error;
      const urls = await signPhotos((data ?? []).map((r) => r.photo_path));
      return (data ?? []).map((r) => ({ ...r, url: urls.get(r.photo_path) ?? null }));
    },
    staleTime: 30_000,
    enabled,
  });
}

export function useCaptainPostcard(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      action:
        { type: "tie"; proofId: string; on: boolean } | { type: "swap"; out: string; in: string },
    ) => {
      const { error } =
        action.type === "tie"
          ? await rpc("break_postcard_tie", {
              p_trip: tripId,
              p_proof: action.proofId,
              p_on: action.on,
            })
          : await rpc("swap_postcard_photo", {
              p_trip: tripId,
              p_out: action.out,
              p_in: action.in,
            });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: postcardKeys.ranking(tripId) }),
  });
}

const postcardPhoto = z.object({
  proof_id: z.string(),
  path: z.string(),
  user_id: z.string(),
  hearts: z.number(),
});
const postcardAnswers = z.object({
  key: z.string(),
  question: z.string(),
  answers: z.array(z.string()),
});
export const postcardCrown = z.object({
  season: z.enum(["preflight", "trip_season"]),
  // Null once the winner has deleted their account; the name then reads "Former player".
  user_id: z.string().nullable(),
  name: z.string(),
  points: z.number(),
  solo: z.boolean(),
});
export type PostcardPhoto = z.infer<typeof postcardPhoto>;
export type PostcardAnswers = z.infer<typeof postcardAnswers>;
export type PostcardCrown = z.infer<typeof postcardCrown>;
export type TripPostcardData = {
  trip_id: string;
  locked_at: string;
  photos: (PostcardPhoto & { url: string | null })[];
  answers: PostcardAnswers[];
  crowns: PostcardCrown[];
  excited: string[];
};

/** The locked postcard (R-605), or null before the lock. */
export function useTripPostcard(tripId: string | null | undefined) {
  return useQuery({
    queryKey: postcardKeys.postcard(tripId ?? ""),
    queryFn: async (): Promise<TripPostcardData | null> => {
      const { data, error } = await supabase
        .from("trip_postcards")
        .select("trip_id, locked_at, photos, answers, crowns, excited")
        .eq("trip_id", tripId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const photos = z.array(postcardPhoto).parse(data.photos);
      const urls = await signPhotos(photos.map((p) => p.path));
      return {
        trip_id: data.trip_id,
        locked_at: data.locked_at,
        photos: photos.map((p) => ({ ...p, url: urls.get(p.path) ?? null })),
        answers: z.array(postcardAnswers).parse(data.answers),
        crowns: z.array(postcardCrown).parse(data.crowns),
        excited: z.array(z.string()).parse(data.excited),
      };
    },
    staleTime: 10 * 60_000,
    enabled: !!tripId,
  });
}

export type Stamp = Database["public"]["Functions"]["my_stamps"]["Returns"][number];
const passportProgress = z.object({
  countries: z.number(),
  level: z.enum(["none", "tourist", "explorer", "voyager", "globetrotter", "passport_junkie"]),
  stars: z.number(),
  next_at: z.number().nullable(),
  badges: z.array(
    z.object({
      badge: z.enum(["us_explorer", "culture_collector", "storyteller"]),
      tier: z.number(),
      progress: z.number(),
      earned_at: z.string(),
      new: z.boolean(),
    }),
  ),
});
export type PassportProgress = z.infer<typeof passportProgress>;

export function useMyStamps() {
  return useQuery({
    queryKey: postcardKeys.stamps,
    queryFn: async (): Promise<Stamp[]> => {
      const { data, error } = await rpc("my_stamps");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function usePassportProgress() {
  return useQuery({
    queryKey: postcardKeys.progress,
    queryFn: async (): Promise<PassportProgress> => {
      const { data, error } = await rpc("my_passport_progress");
      if (error) throw error;
      return passportProgress.parse(data);
    },
    staleTime: 5 * 60_000,
  });
}

export function useMarkBadgesSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await rpc("mark_badges_seen");
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: postcardKeys.progress }),
  });
}
