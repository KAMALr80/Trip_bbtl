import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** "First Culture Share" badges per track, computed on the server from finished experiences. */
export function CultureBadgeRow() {
  const [tracks, setTracks] = useState<string[]>([]);
  useEffect(() => { void (supabase as unknown as { rpc: (n: string) => Promise<{ data: { track: string }[] | null }> }).rpc("culture_badges").then(({ data }) => setTracks((data ?? []).map((x) => x.track))); }, []);
  return <div className="mt-2 flex flex-wrap gap-2">{[["home", "From Home"], ["travel", "On a Trip"]].map(([k, l]) => <span key={k} className={`rounded-full border border-border px-3 py-1 text-xs font-extrabold ${tracks.includes(k!) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground opacity-60"}`}>🏅 First Culture Share · {l}</span>)}</div>;
}
