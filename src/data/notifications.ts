// Reminder settings (M4-07): which types come as push or email, and quiet hours.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rpc } from "./rpc";

const key = ["me", "notifications"] as const;

export function useNotificationSettings() {
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await rpc("my_notification_settings");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSetNotificationPref() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (p: { type: string; push: boolean; email: boolean }) => {
      const { error } = await rpc("set_notification_pref", {
        p_type: p.type,
        p_push: p.push,
        p_email: p.email,
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useSetQuietHours() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (p: { start: string; end: string }) => {
      const { error } = await rpc("set_quiet_hours", { p_start: p.start, p_end: p.end });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
