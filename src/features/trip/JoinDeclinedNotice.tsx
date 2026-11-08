// Tells a player their join request was declined (N-6). Only they can read it (my_join_declines),
// and it goes when they dismiss it or ask to join that trip again.
import { useEffect, useState } from "react";
import { rpc } from "@/data/rpc";
import { useT } from "@/i18n";

type Decline = { trip_id: string; name: string };

export function JoinDeclinedNotice({ className = "" }: { className?: string }) {
  const t = useT();
  const [declines, setDeclines] = useState<Decline[]>([]);
  useEffect(() => {
    let live = true;
    void rpc("my_join_declines").then((r) => {
      if (live && !r.error) setDeclines(r.data ?? []);
    });
    return () => {
      live = false;
    };
  }, []);
  const decline = declines[0];
  if (!decline) return null;
  return (
    <div
      role="status"
      className={`w-full rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm ${className}`}
    >
      <p className="font-bold">{t("join.declinedTitle", { trip: decline.name })}</p>
      <p className="mt-1 text-ink-soft">{t("join.declinedLine")}</p>
      <button
        type="button"
        className="mt-2 min-h-11 font-bold text-primary underline"
        onClick={() => {
          setDeclines((list) => list.slice(1));
          // Supabase calls run only when awaited or then-ed.
          void rpc("dismiss_join_decline", { p_trip: decline.trip_id }).then(() => undefined);
        }}
      >
        {t("join.declinedDismiss")}
      </button>
    </div>
  );
}
