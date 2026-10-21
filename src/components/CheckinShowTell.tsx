import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/friendly-error";

type Task = {
  id: string;
  user_id: string;
  title: string | null;
  mission_text: string;
  presented_at: string | null;
};

export function CheckinShowTell({
  tripId,
  week,
  names,
  canHost,
}: {
  tripId: string;
  week: number;
  names: Record<string, string>;
  canHost: boolean;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    const { data, error: e } = await supabase.rpc("night_checkin_tasks", {
      p_trip: tripId,
      p_week: week,
    });
    if (e) setError(friendlyError(e));
    else setTasks(data ?? []);
  }
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 12000);
    return () => window.clearInterval(timer);
  }, [tripId, week]);
  async function present(id: string) {
    setBusy(true);
    setError("");
    const { error: e } = await supabase.rpc("present_checkin", {
      p_trip: tripId,
      p_week: week,
      p_claim: id,
    });
    if (e) setError(friendlyError(e));
    else await load();
    setBusy(false);
  }
  return (
    <section
      className="rounded-2xl border border-amber-300/40 bg-amber-100/10 p-4 mt-4"
      aria-label="Early Check-In show and tell"
    >
      <h3 className="font-display text-lg font-extrabold">Show &amp; tell · Early Check-In</h3>
      <p className="text-xs mt-1">
        Present your completed culture tasks after the warm-up. Leaders approve points in Captain
        Tools.
      </p>
      {tasks.length === 0 ? (
        <p className="text-sm mt-3">No tasks waiting to be presented.</p>
      ) : (
        <ul className="grid gap-2 mt-3">
          {tasks.map((task) => (
            <li key={task.id} className="rounded-xl bg-card/80 p-3 text-sm">
              <strong>
                {names[task.user_id] ?? "Squadmate"} · {task.title || "Early Check-In"}
              </strong>
              <p className="mt-1">{task.mission_text}</p>
              {task.presented_at ? (
                <span className="text-xs font-bold">Presented ✓ · pending leader approval</span>
              ) : canHost ? (
                <Button
                  size="sm"
                  className="mt-2"
                  disabled={busy}
                  onClick={() => void present(task.id)}
                >
                  Mark presented
                </Button>
              ) : (
                <span className="text-xs">Waiting for the host to mark presented</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive mt-2">
          {error}
        </p>
      )}
    </section>
  );
}
