// Game Night Live (M3-07): the trip's one open session, its live counts, and the actions on it.
// Counts refresh every few seconds while the screen is open.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";
import { scheduleKeys } from "./daily";
import { rpc } from "./rpc";

export type LiveSession = Tables<"live_sessions">;
export type LiveRow = Database["public"]["Functions"]["live_state"]["Returns"][number];
export type Award = "best_overall" | "most_creative" | "best_story";
export const AWARDS: Award[] = ["best_overall", "most_creative", "best_story"];

export const liveKeys = {
  session: (tripId: string) => ["trip", tripId, "live"] as const,
  state: (sessionId: string) => ["live", sessionId] as const,
  crowns: (tripId: string) => ["trip", tripId, "crowns"] as const,
};

/** The trip's latest session (open, or the last one closed), if any. */
export function useLiveSession(tripId: string) {
  return useQuery({
    queryKey: liveKeys.session(tripId),
    queryFn: async (): Promise<LiveSession | null> => {
      const { data, error } = await supabase
        .from("live_sessions")
        .select("*")
        .eq("trip_id", tripId)
        .order("opened_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    refetchInterval: 15_000,
  });
}

export function useLiveState(sessionId: string | null | undefined, live: boolean) {
  return useQuery({
    queryKey: liveKeys.state(sessionId ?? ""),
    queryFn: async () => {
      const { data, error } = await rpc("live_state", { p_session: sessionId! });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!sessionId,
    refetchInterval: live ? 4_000 : false,
  });
}

/** Every Game Night action, each refreshing the session, its counts and the standings. */
export function useLiveActions(tripId: string, sessionId: string | null | undefined) {
  const queryClient = useQueryClient();
  const settle = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: liveKeys.session(tripId) }),
      queryClient.invalidateQueries({ queryKey: liveKeys.state(sessionId ?? "") }),
      queryClient.invalidateQueries({ queryKey: scheduleKeys.standings(tripId) }),
      queryClient.invalidateQueries({ queryKey: liveKeys.crowns(tripId) }),
    ]);
  const call = async (p: PromiseLike<{ error: unknown }>) => {
    const { error } = await p;
    if (error) throw error;
  };
  return useMutation({
    mutationFn: async (
      action:
        | { type: "open"; callNight: string | null; crowning: boolean }
        | { type: "present"; presenter: string }
        | { type: "award"; award: Award; nominee: string }
        | { type: "close" }
        | { type: "reopen" },
    ) => {
      if (action.type === "open")
        return call(
          rpc("open_live", {
            p_trip: tripId,
            p_call_night: action.callNight,
            p_crowning: action.crowning,
          }),
        );
      if (!sessionId) return;
      if (action.type === "present")
        return call(rpc("live_present", { p_session: sessionId, p_presenter: action.presenter }));
      if (action.type === "award")
        return call(
          rpc("live_vote_award", {
            p_session: sessionId,
            p_award: action.award,
            p_nominee: action.nominee,
          }),
        );
      if (action.type === "close") return call(rpc("close_live", { p_session: sessionId }));
      return call(rpc("reopen_live", { p_session: sessionId }));
    },
    onSettled: settle,
  });
}

/** Crowns decided so far (M3-11). */
export function useCrowns(tripId: string) {
  return useQuery({
    queryKey: liveKeys.crowns(tripId),
    queryFn: async () => {
      const { data, error } = await supabase.from("trip_crowns").select("*").eq("trip_id", tripId);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

/** Standings for one season (M3-01), refreshed after every award. */
export function useStandings(tripId: string, season: "preflight" | "trip_season") {
  return useQuery({
    queryKey: [...scheduleKeys.standings(tripId), season],
    queryFn: async () => {
      const { data, error } = await rpc("trip_standings", { p_trip: tripId, p_season: season });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
  });
}

/** "Why do I have 47 points?": my approved points this season, summed by source. */
export function usePointsBreakdown(tripId: string, season: "preflight" | "trip_season") {
  return useQuery({
    queryKey: [...scheduleKeys.standings(tripId), "mine", season],
    queryFn: async () => {
      const [rows, rules] = await Promise.all([
        supabase
          .from("points_ledger")
          .select("source, points")
          .eq("trip_id", tripId)
          .eq("season", season)
          .eq("status", "approved"),
        supabase.from("points_rules").select("source, label"),
      ]);
      if (rows.error) throw rows.error;
      const sums = new Map<string, number>();
      for (const r of rows.data ?? []) sums.set(r.source, (sums.get(r.source) ?? 0) + r.points);
      return [...sums].map(([source, points]) => ({
        source,
        points,
        label: rules.data?.find((x) => x.source === source)?.label ?? source,
      }));
    },
    staleTime: 15_000,
  });
}

/** A solo player's crown goal for the season (R-507): 60% of the planned points. */
export function useSoloGoal(tripId: string, season: "preflight" | "trip_season", enabled: boolean) {
  return useQuery({
    queryKey: [...scheduleKeys.standings(tripId), "goal", season],
    queryFn: async () => {
      const { data, error } = await rpc("solo_goal", { p_trip: tripId, p_season: season });
      if (error) throw error;
      return data ?? 0;
    },
    enabled,
    staleTime: 300_000,
  });
}
