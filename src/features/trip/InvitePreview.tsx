import { tripDisplayName } from "@/lib/trip-display-name";
import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { dicebearUrl } from "@/lib/player-cards";
import { friendlyRange } from "@/lib/trip-dates";
import { Avatar } from "@/features/players/PlayerCards";
import { PACKS } from "@/features/at-home/AtHome";
import { JoinNameField } from "@/features/trip/JoinNameField";
import { useJoinName } from "@/features/trip/use-join-name";

type Preview = {
  name: string;
  destination: string;
  motto: string | null;
  start_date: string;
  end_date: string;
  member_count: number;
  captain_name: string;
  captain_style: string;
  captain_seed: string;
  captain_avatar_url: string | null;
};

/** Pinned "Join room" card on the dashboard. Nothing joins until the visitor taps Join room. */
export function JoinRoomCard({
  code,
  onJoin,
  onDismiss,
  onExpired,
}: {
  code: string;
  onJoin: (tripId: string) => Promise<void>;
  onDismiss: () => void;
  onExpired: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const name = useJoinName();
  useEffect(() => {
    let alive = true;
    void supabase
      .rpc("trip_invite_preview" as never, { p_code: code } as never)
      .then(({ data, error: cause }: { data: unknown; error: { message: string } | null }) => {
        if (!alive) return;
        const p = ((data as Preview[] | null) ?? [])[0] ?? null;
        setPreview(p);
        setError(cause ? friendlyError(cause) : "");
        setLoading(false);
        if (!p && !cause) onExpired();
      });
    return () => {
      alive = false;
    };
  }, [code]);
  async function join() {
    if (busy || !name.valid) return;
    setBusy(true);
    setError("");
    const { data, error: cause } = await supabase.rpc("join_trip", {
      p_code: code,
      p_display_name: name.clean,
    });
    if (cause || !data) {
      setError(
        (cause ? friendlyError(cause) : null) ??
          "This invite couldn't be opened. Ask your Captain for a fresh link.",
      );
      setBusy(false);
      return;
    }
    try {
      await onJoin(data);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? friendlyError(cause)
          : "Couldn't open your trip. Please try again.",
      );
      setBusy(false);
    }
  }
  if (loading)
    return <div className="app-card mb-4 h-32 animate-pulse" aria-label="Loading invitation" />;
  if (!preview)
    return error ? (
      <div className="app-card mb-4">
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    ) : null;
  const illustration = PACKS.find((p) => preview.destination.toLowerCase().includes(p.key));
  return (
    <section
      className="app-card mb-4 border-2 border-blue overflow-hidden"
      aria-label="Trip invitation"
    >
      {illustration && (
        <Button
          variant="ghost"
          className="relative w-full h-32 p-0 mb-3 overflow-hidden rounded-xl"
          aria-label={`Open ${illustration.name} invitation`}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <img
            src={illustration.img}
            alt={`${illustration.name} illustration`}
            className="w-full h-full object-cover"
          />
          <span className="absolute bottom-0 inset-x-0 bg-background/85 px-3 py-2 text-left font-display font-extrabold">
            {illustration.name} <ArrowRight size={16} className="inline" />
          </span>
        </Button>
      )}
      <div className="flex items-start gap-3">
        <Avatar
          url={
            preview.captain_avatar_url || dicebearUrl(preview.captain_style, preview.captain_seed)
          }
          name={preview.captain_name}
          className="h-12 w-12 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-blue">📌 YOU'RE INVITED</p>
          <h2 className="font-display text-xl font-extrabold mt-1 break-words">
            {tripDisplayName(preview.name)}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Captain {preview.captain_name} · {friendlyRange(preview.start_date, preview.end_date)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {preview.destination} · {preview.member_count}{" "}
            {preview.member_count === 1 ? "person" : "people"} in
          </p>
          {expanded && (
            <p className="text-sm mt-3">
              {preview.motto || `Your squad is headed to ${preview.destination}.`}
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" aria-label="Not now" onClick={onDismiss}>
          <X />
        </Button>
      </div>
      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="mt-4">
        <JoinNameField name={name} />
      </div>
      <div className="mt-4 flex gap-2">
        <Button
          variant="playful"
          className="flex-1"
          disabled={busy || !name.valid}
          onClick={() => void join()}
        >
          {busy ? "Joining…" : "Join room"}
          <ArrowRight />
        </Button>
        <Button variant="outline" onClick={onDismiss}>
          Not now
        </Button>
      </div>
    </section>
  );
}
