// Proofs and Crew Check (M3-06): send a photo or a few words for a quest, and 👍 the crew's.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";
import { compressImage } from "@/lib/compress-image";
import { checkProof } from "@/lib/proof-check.functions";
import { scheduleKeys } from "./daily";
import { rpc } from "./rpc";

export type Proof = Tables<"proofs">;
export type CrewProof = Database["public"]["Functions"]["crew_check"]["Returns"][number] & {
  photoUrl: string | null;
};

export const proofKeys = {
  mine: (tripId: string) => ["trip", tripId, "proofs"] as const,
  crew: (tripId: string) => ["trip", tripId, "crew-check"] as const,
};

export function useMyProofs(tripId: string | null | undefined) {
  return useQuery({
    queryKey: proofKeys.mine(tripId ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase.from("proofs").select("*").eq("trip_id", tripId!);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
    enabled: !!tripId,
  });
}

/** Other players' proofs waiting for a 👍, with signed photo links where I may see the photo. */
export function useCrewCheck(tripId: string | null | undefined) {
  return useQuery({
    queryKey: proofKeys.crew(tripId ?? ""),
    queryFn: async (): Promise<CrewProof[]> => {
      const { data, error } = await rpc("crew_check", { p_trip: tripId! });
      if (error) throw error;
      const rows = data ?? [];
      const paths = rows.map((r) => r.photo_path).filter((p): p is string => !!p);
      const signed = paths.length
        ? ((await supabase.storage.from("quest-proofs").createSignedUrls(paths, 600)).data ?? [])
        : [];
      return rows.map((r) => ({
        ...r,
        photoUrl: signed.find((s) => s.path === r.photo_path)?.signedUrl ?? null,
      }));
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: !!tripId,
  });
}

/** Send a proof: the photo goes to quest-proofs/<trip>/<me>/<item>/, then the server records it. */
export function useSubmitProof(tripId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      item,
      photo,
      text,
    }: {
      item: string;
      photo: File | null;
      text: string;
    }) => {
      let path: string | null = null;
      if (photo) {
        const small = await compressImage(photo, 1280, 300_000);
        path = `${tripId}/${userId}/${item}/${Date.now()}.jpg`;
        const up = await supabase.storage
          .from("quest-proofs")
          .upload(path, small, { contentType: small.type || "image/jpeg" });
        if (up.error) throw up.error;
      }
      const { data, error } = await rpc("submit_proof", {
        p_item: item,
        p_photo_path: path,
        p_body: text.trim() || null,
      });
      if (error) throw error;
      if (data && path) await checkProof({ data: { proofId: data } }).catch(() => null);
      return data;
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: proofKeys.mine(tripId) }),
        queryClient.invalidateQueries({ queryKey: scheduleKeys.standings(tripId) }),
      ]),
  });
}

export function useApproveProof(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (proofId: string) => {
      const { data, error } = await rpc("approve_proof", { p_proof: proofId });
      if (error) throw error;
      return data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: proofKeys.crew(tripId) }),
  });
}

/** Open (reveal) a sealed quest, mission or trip quest (M3-05, M3-08). */
export function useOpenItem(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: string) => {
      const { data, error } = await rpc("open_item", { p_item: item });
      if (error) throw error;
      return data;
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: scheduleKeys.schedule(tripId) }),
        queryClient.invalidateQueries({ queryKey: scheduleKeys.standings(tripId) }),
      ]),
  });
}

/** Share my trip quest with the crew, or keep it a surprise (R-344). */
export function useShareTripQuest(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, shared }: { item: string; shared: boolean }) => {
      const { error } = await rpc("share_trip_quest", { p_item: item, p_shared: shared });
      if (error) throw error;
      return shared;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: scheduleKeys.schedule(tripId) }),
  });
}

/** A Surprise Drop proof: one photo per Bingo square / Scavenger find, or one for Speed / Photo. */
export function useSubmitDropProof(tripId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      item,
      part,
      photo,
      text,
    }: {
      item: string;
      part: number;
      photo: File | null;
      text: string;
    }) => {
      let path: string | null = null;
      if (photo) {
        const small = await compressImage(photo, 1280, 300_000);
        path = `${tripId}/${userId}/${item}/${part}-${Date.now()}.jpg`;
        const up = await supabase.storage
          .from("quest-proofs")
          .upload(path, small, { contentType: small.type || "image/jpeg" });
        if (up.error) throw up.error;
      }
      const { data, error } = await rpc("submit_drop_proof", {
        p_item: item,
        p_part: part,
        p_photo_path: path,
        p_body: text.trim() || null,
      });
      if (error) throw error;
      if (data && path) await checkProof({ data: { proofId: data } }).catch(() => null);
      return data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: proofKeys.mine(tripId) }),
  });
}
