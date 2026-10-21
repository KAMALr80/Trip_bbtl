import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TripWithRole } from "@/lib/trips";

type Quest = { state: string; kind: string; open_by: string | null; destroy_at: string | null };
const rpc = supabase as unknown as {
  rpc: (name: string, args: object) => PromiseLike<{ data: unknown; error: unknown }>;
};
export function useFlightReminders(trip: TripWithRole | null, userId: string) {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [live, setLive] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!trip || !userId || trip.season_rule !== "a2c") {
      setQuests([]);
      setLive(false);
      return;
    }
    let active = true;
    const load = async () => {
      const [q, n] = await Promise.all([
        rpc.rpc("sealed_quest_state", { p_trip: trip.id }),
        rpc.rpc("games_live", { p_trip: trip.id }),
      ]);
      if (active) {
        setQuests(q.error ? [] : ((q.data as Quest[]) ?? []));
        setLive(n.data === true);
        setNow(Date.now());
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [trip?.id, trip?.season_rule, userId]);
  return (
    trip?.season_rule === "a2c" &&
    (live ||
      quests.some(
        (q) =>
          q.kind === "sealed" &&
          ((q.state === "sealed" && (!q.open_by || new Date(q.open_by).getTime() > now)) ||
            (q.state === "open" &&
              q.destroy_at &&
              new Date(q.destroy_at).getTime() > now &&
              new Date(q.destroy_at).getTime() - now < 3 * 3600000)),
      ))
  );
}
