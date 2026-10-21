import { safeSetItem } from "@/lib/safe-storage";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { hapticTap } from "@/lib/haptics";

type Kind = "card" | "qotw" | "bingo" | "quest" | "mission";
const db = supabase as unknown as {
  rpc: (f: string, a: object) => PromiseLike<{ error: { message: string } | null }>;
};
const keyFor = (text: string) => {
  let h = 2166136261;
  const s = text.trim().toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h${(h >>> 0).toString(36)}`;
};

/** Optional anonymous 👍/👎. The server stores only the item and the vote; this phone remembers it so you vote once. */
export function ContentVote({
  tripId,
  kind,
  text,
  itemKey,
}: {
  tripId: string;
  kind: Kind;
  text: string;
  itemKey?: string;
}) {
  const key = itemKey ?? keyFor(text),
    local = `tj-rated-${kind}-${key}`;
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    setDone(window.localStorage.getItem(local));
  }, [local]);
  async function rate(vote: 1 | -1) {
    if (done) return;
    hapticTap();
    setDone(vote === 1 ? "up" : "down");
    safeSetItem(local, vote === 1 ? "up" : "down");
    await db.rpc("rate_content", {
      p_trip: tripId,
      p_kind: kind,
      p_key: key,
      p_text: text,
      p_vote: vote,
    });
  }
  if (!text) return null;
  return (
    <div className="flex items-center gap-1" aria-label="Rate this">
      {done ? (
        <span className="text-xs text-muted-foreground">Thanks {done === "up" ? "👍" : "👎"}</span>
      ) : (
        <>
          <button
            type="button"
            className="h-9 w-9 rounded-full text-base hover:bg-muted active:scale-95"
            aria-label="Thumbs up"
            onClick={() => void rate(1)}
          >
            👍
          </button>
          <button
            type="button"
            className="h-9 w-9 rounded-full text-base hover:bg-muted active:scale-95"
            aria-label="Thumbs down"
            onClick={() => void rate(-1)}
          >
            👎
          </button>
        </>
      )}
    </div>
  );
}

/** Founder view: anonymous 👍/👎 totals per item. */
export function ContentRatings() {
  const [rows, setRows] = useState<
    { kind: string; item_text: string; ups: number; downs: number }[] | null
  >(null);
  useEffect(() => {
    void (supabase as unknown as { rpc: (f: string) => PromiseLike<{ data: typeof rows }> })
      .rpc("content_feedback_summary")
      .then(({ data }) => setRows(data ?? []));
  }, []);
  return (
    <div className="mt-8">
      <h2 className="font-display text-xl font-extrabold">Content ratings 👍👎</h2>
      <p className="text-xs text-muted-foreground mt-1">
        Anonymous — totals per card or challenge only.
      </p>
      {rows === null ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      ) : !rows.length ? (
        <p className="mt-3 text-sm text-muted-foreground">No ratings yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="app-card !p-3 flex items-center gap-3 text-sm">
              <span className="flex-1 min-w-0">
                <span className="eyebrow text-muted-foreground block">{r.kind}</span>
                {r.item_text}
              </span>
              <b className="text-green">👍 {r.ups}</b>
              <b className="text-destructive">👎 {r.downs}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
