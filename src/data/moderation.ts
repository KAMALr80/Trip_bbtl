// Image moderation (M6-02, R-905): players report a crew photo; app admins review the queue.
// The server decides who sees what (trip_private.proof_photo_ok / photo_hidden).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { rpc } from "./rpc";

export type QueueItem = Database["public"]["Functions"]["moderation_queue"]["Returns"][number] & {
  url: string | null;
};
const queueKey = (closed: boolean) => ["moderation", closed] as const;

export function useReportPhoto() {
  return useMutation({
    mutationFn: async ({ proofId, reason }: { proofId: string; reason: string }) => {
      const { error } = await rpc("report_proof_photo", { p_proof: proofId, p_reason: reason });
      if (error) throw error;
    },
  });
}

export function useModerationQueue(includeClosed = false) {
  return useQuery({
    queryKey: queueKey(includeClosed),
    queryFn: async (): Promise<QueueItem[]> => {
      const { data, error } = await rpc("moderation_queue", { p_include_closed: includeClosed });
      if (error) throw error;
      const rows = data ?? [];
      const paths = rows.map((r) => r.photo_path);
      let signed: { path: string | null; signedUrl: string | null }[] = [];
      try {
        signed = paths.length
          ? ((await supabase.storage.from("quest-proofs").createSignedUrls(paths, 600)).data ?? [])
          : [];
      } catch {
        signed = [];
      }
      return rows.map((r) => ({
        ...r,
        url: signed.find((s) => s.path === r.photo_path)?.signedUrl ?? null,
      }));
    },
    staleTime: 30_000,
  });
}

export function useModerate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; action: "approve" | "remove" | "warn"; note: string }) => {
      const { error } = await rpc("moderate_photo", {
        p_id: a.id,
        p_action: a.action,
        p_note: a.note || null,
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["moderation"] }),
  });
}
