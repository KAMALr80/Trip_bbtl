// The trip schedule as the player sees it (M3-03) and Daily Discovery / Daily Card answers (M3-04).
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";
import { rpc } from "./rpc";
import { sendOrQueue } from "./offline/outbox";

export type ScheduleItem = Database["public"]["Functions"]["my_schedule"]["Returns"][number];
export type DailyAnswer = Tables<"daily_answers">;

export const scheduleKeys = {
  schedule: (tripId: string) => ["trip", tripId, "schedule"] as const,
  answers: (tripId: string) => ["trip", tripId, "daily-answers"] as const,
  standings: (tripId: string) => ["trip", tripId, "standings"] as const,
};

export const scheduleQuery = (tripId: string) =>
  queryOptions({
    queryKey: scheduleKeys.schedule(tripId),
    queryFn: async () => {
      const { data, error } = await rpc("my_schedule", { p_trip: tripId, p_at: null });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

export const dailyAnswersQuery = (tripId: string) =>
  queryOptions({
    queryKey: scheduleKeys.answers(tripId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_answers")
        .select("*")
        .eq("trip_id", tripId);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

/** My view of the schedule: the crew's items and mine, with text only once an item has opened. */
export function useMySchedule(tripId: string | null | undefined) {
  return useQuery({ ...scheduleQuery(tripId ?? ""), enabled: !!tripId });
}

export function useDailyAnswers(tripId: string | null | undefined) {
  return useQuery({ ...dailyAnswersQuery(tripId ?? ""), enabled: !!tripId });
}

export type DailyResult = Database["public"]["Functions"]["answer_daily"]["Returns"][number];

/**
 * Answer a Daily Discovery or Daily Card; refreshes my answers and the standings. With no network
 * the answer waits in the outbox (M4-04) and the result is `Queued`.
 */
export function useAnswerDaily(tripId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: ({ item, choice }: { item: string; choice: number | null }) =>
      sendOrQueue<DailyResult | null>(
        userId,
        { kind: "answer_daily", tripId, item, choice },
        null,
        crypto.randomUUID(),
      ),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: scheduleKeys.answers(tripId) }),
        queryClient.invalidateQueries({ queryKey: scheduleKeys.standings(tripId) }),
      ]),
  });
}

/** Today's open item of a kind (the latest that has opened and not closed), if any. */
export function openItem(items: ScheduleItem[] | undefined, kind: string, now: number) {
  return (items ?? [])
    .filter(
      (i) =>
        i.kind === kind &&
        i.is_open &&
        new Date(i.opens_at).getTime() <= now &&
        (!i.closes_at || new Date(i.closes_at).getTime() > now),
    )
    .at(-1);
}
