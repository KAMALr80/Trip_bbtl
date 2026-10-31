// Journal (M3-12) and the trip guide / solo showcase page (M3-12, M3-13).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { scheduleKeys } from "./daily";
import { rpc } from "./rpc";
import { sendOrQueue } from "./offline/outbox";

export const guideKeys = {
  options: (item: string) => ["journal", item, "options"] as const,
  mine: (tripId: string) => ["trip", tripId, "journal"] as const,
  guide: (tripId: string) => ["trip", tripId, "guide"] as const,
  state: (tripId: string) => ["trip", tripId, "guide-state"] as const,
  prefs: (tripId: string) => ["trip", tripId, "guide-prefs"] as const,
};

/** Tonight's prompt (index 0) and the two it can be swapped for. */
export function useJournalOptions(item: string | undefined) {
  return useQuery({
    queryKey: guideKeys.options(item ?? ""),
    queryFn: async () => {
      const { data, error } = await rpc("journal_options", { p_item: item! });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!item,
    staleTime: Infinity,
  });
}

export function useMyJournal(tripId: string) {
  return useQuery({
    queryKey: guideKeys.mine(tripId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_entries")
        .select("*")
        .eq("trip_id", tripId);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

/** Save tonight's journal entry; with no network it waits in the outbox (M4-04). */
export function useWriteJournal(tripId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: ({ item, body, choice }: { item: string; body: string; choice: number }) =>
      sendOrQueue<string | null>(
        userId,
        { kind: "write_journal", tripId, item, body, choice },
        null,
        crypto.randomUUID(),
      ),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: guideKeys.mine(tripId) }),
        queryClient.invalidateQueries({ queryKey: guideKeys.guide(tripId) }),
        queryClient.invalidateQueries({ queryKey: scheduleKeys.standings(tripId) }),
      ]),
  });
}

/** The guide as the crew sees it, with signed photo links. */
export function useTripGuide(tripId: string) {
  return useQuery({
    queryKey: guideKeys.guide(tripId),
    queryFn: async () => {
      const { data, error } = await rpc("trip_guide", { p_trip: tripId });
      if (error) throw error;
      const rows = data ?? [];
      const paths = rows.map((r) => r.photo_path).filter((p): p is string => !!p);
      const signed = paths.length
        ? ((await supabase.storage.from("quest-proofs").createSignedUrls(paths, 3600)).data ?? [])
        : [];
      return rows.map((r) => ({
        ...r,
        photoUrl: signed.find((s) => s.path === r.photo_path)?.signedUrl ?? null,
      }));
    },
    staleTime: 60_000,
  });
}

export function useGuideState(tripId: string) {
  return useQuery({
    queryKey: guideKeys.state(tripId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_guides")
        .select("token, published_at")
        .eq("trip_id", tripId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useGuidePrefs(tripId: string) {
  return useQuery({
    queryKey: guideKeys.prefs(tripId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guide_prefs")
        .select("show_name, share_photos")
        .eq("trip_id", tripId)
        .maybeSingle();
      if (error) throw error;
      return data ?? { show_name: false, share_photos: false };
    },
  });
}

export function useGuideActions(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      action:
        | { type: "prefs"; showName: boolean; sharePhotos: boolean }
        | { type: "publish"; publish: boolean },
    ) => {
      if (action.type === "prefs") {
        const { error } = await rpc("set_guide_prefs", {
          p_trip: tripId,
          p_show_name: action.showName,
          p_share_photos: action.sharePhotos,
        });
        if (error) throw error;
        return;
      }
      const { error } = await rpc("publish_guide", { p_trip: tripId, p_publish: action.publish });
      if (error) throw error;
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: guideKeys.prefs(tripId) }),
        queryClient.invalidateQueries({ queryKey: guideKeys.state(tripId) }),
      ]),
  });
}
