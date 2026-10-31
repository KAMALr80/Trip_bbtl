// Proofs and Crew Check (M3-06): send a photo or a few words for a quest, and 👍 the crew's.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";
import { compressImage } from "@/lib/compress-image";
import { scheduleKeys } from "./daily";
import { rpc } from "./rpc";
import { sendOrQueue, type Queued } from "./offline/outbox";

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

/**
 * Send a proof: the photo goes to quest-proofs/<trip>/<me>/<item>/, then the server records it.
 * With no network both wait in the outbox (M4-04) and the result is `Queued`.
 */
export function useSubmitProof(tripId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: async ({
      item,
      photo,
      text,
    }: {
      item: string;
      photo: File | null;
      text: string;
    }): Promise<string | null | Queued> => {
      const id = crypto.randomUUID();
      const small = photo ? await compressImage(photo, 1280, 300_000) : null;
      const photoPath = small ? `${tripId}/${userId}/${item}/${id}.jpg` : null;
      return sendOrQueue<string | null>(
        userId,
        { kind: "submit_proof", tripId, item, body: text.trim() || null, photoPath },
        small,
        id,
      );
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: proofKeys.mine(tripId) }),
        queryClient.invalidateQueries({ queryKey: scheduleKeys.standings(tripId) }),
      ]),
  });
}

/** 👍 a crew proof; queued with no network (M4-04). */
export function useApproveProof(tripId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: (proofId: string) =>
      sendOrQueue<boolean>(
        userId,
        { kind: "approve_proof", tripId, proof: proofId },
        null,
        crypto.randomUUID(),
      ),
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

/**
 * A Surprise Drop proof: one photo per Bingo square / Scavenger find, or one for Speed / Photo.
 * Queued with no network (M4-04).
 */
export function useSubmitDropProof(tripId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
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
    }): Promise<string | null | Queued> => {
      const id = crypto.randomUUID();
      const small = photo ? await compressImage(photo, 1280, 300_000) : null;
      const photoPath = small ? `${tripId}/${userId}/${item}/${part}-${id}.jpg` : null;
      return sendOrQueue<string | null>(
        userId,
        { kind: "submit_drop_proof", tripId, item, part, body: text.trim() || null, photoPath },
        small,
        id,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: proofKeys.mine(tripId) }),
  });
}
