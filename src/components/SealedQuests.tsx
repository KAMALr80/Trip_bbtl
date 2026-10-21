import { useCallback, useEffect, useState } from "react";
import { Check, Clock3, ImagePlus, Ticket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import passArt from "@/assets/play-sealed-pass.webp";
import stageArt from "@/assets/play-showcase-stage.webp";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { compressImage } from "@/lib/compress-image";
import { hapticTap } from "@/lib/haptics";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";

type Q = {
  id: string;
  kind: "sealed" | "showcase";
  drop_no: number;
  value: number;
  open_by: string;
  opened_at: string | null;
  destroy_at: string | null;
  state: string;
  title: string | null;
  mission_text: string | null;
  backstory: string | null;
  proof_mode: string | null;
  points: number;
  meetup_at: string | null;
};
type Feed = {
  id: string;
  user_id: string;
  kind: string;
  value: number;
  title: string;
  proof_mode: string | null;
  proof_path: string | null;
  speed: boolean;
  state: string;
};
const rpc = supabase as unknown as {
  rpc: (
    name: string,
    args: object,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
function left(iso: string | null, now: number) {
  if (!iso) return "";
  const m = Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 60000));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export function SealedQuests({
  trip,
  members,
  cards,
  userId,
  viewOnly,
  proofOnly = false,
}: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  viewOnly: boolean;
  proofOnly?: boolean;
}) {
  const leader = !viewOnly && (trip.myRole === "captain" || trip.myRole === "co_captain");
  const [qs, setQs] = useState<Q[]>([]),
    [feed, setFeed] = useState<Feed[]>([]),
    [urls, setUrls] = useState<Record<string, string>>({}),
    [insights, setInsights] = useState<Record<string, string>>({});
  const [proofOpen, setProofOpen] = useState(proofOnly),
    [busy, setBusy] = useState(false),
    [revealing, setRevealing] = useState(false),
    [error, setError] = useState(""),
    [now, setNow] = useState(Date.now());
  const load = useCallback(async () => {
    const [s, f, i] = await Promise.all([
      proofOnly
        ? Promise.resolve({ data: [], error: null })
        : rpc.rpc("sealed_quest_state", { p_trip: trip.id }),
      leader
        ? rpc.rpc("sealed_proof_feed", { p_trip: trip.id })
        : Promise.resolve({ data: [], error: null }),
      !proofOnly && trip.season_rule === "a2c"
        ? rpc.rpc("a2c_quest_insights", { p_trip: trip.id })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (s.error || f.error) {
      setError(friendlyError(s.error ?? f.error));
      return;
    }
    setQs((s.data as Q[]) ?? []);
    const fd = (f.data as Feed[]) ?? [];
    setFeed(fd);
    setNow(Date.now());
    setError("");
    setInsights(
      Object.fromEntries(
        ((i.data as { quest_id: string; insight: string }[]) ?? []).map((x) => [
          x.quest_id,
          x.insight,
        ]),
      ),
    );
    const paths = fd.map((x) => x.proof_path).filter((p): p is string => !!p);
    if (paths.length) {
      const { data } = await supabase.storage.from("quest-proofs").createSignedUrls(paths, 600);
      const map: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
      setUrls(map);
    }
  }, [trip.id, trip.season_rule, leader, proofOnly]);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    const c = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      window.clearInterval(t);
      window.clearInterval(c);
    };
  }, [load]);
  async function act(args: object) {
    setBusy(true);
    setError("");
    const r = await rpc.rpc("sealed_quest_action", args);
    if (r.error) setError(friendlyError(r.error));
    else await load();
    setBusy(false);
  }
  async function decline(id: string) {
    setBusy(true);
    setError("");
    const r = await rpc.rpc("season_game_decline", { p_find: id });
    if (r.error) setError(friendlyError(r.error));
    else await load();
    setBusy(false);
  }
  async function upload(q: Q, file: File) {
    setBusy(true);
    setError("");
    try {
      const small = await compressImage(file, 1280, 300_000);
      const path = `${trip.id}/${userId}/${q.id}/${Date.now()}.jpg`;
      const up = await supabase.storage
        .from("quest-proofs")
        .upload(path, small, { contentType: small.type || "image/jpeg" });
      if (up.error) {
        setError(friendlyError(up.error));
        return;
      }
      const result = await rpc.rpc("sealed_quest_action", {
        p_quest: q.id,
        p_action: "submit",
        p_mode: "upload",
        p_path: path,
      });
      if (result.error) setError(friendlyError(result.error));
      else await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  const name = (id: string) =>
    cards.find((c) => c.user_id === id)?.game_name ||
    members.find((m) => m.user_id === id)?.display_name ||
    "Player";
  const sealed = qs.filter((q) => q.kind === "sealed");
  const current =
    sealed.find((q) => q.state === "open") ??
    sealed.find((q) => q.state === "sealed") ??
    sealed.at(-1);
  const showcase = qs.find((q) => q.kind === "showcase");
  if (!current && !showcase && !feed.length && !error) return null;
  return (
    <div className="mt-4 grid gap-4">
      {!proofOnly && current && (
        <section
          className={`flight-ticket ${current.state === "destroyed" ? "flight-closed" : ""} ${revealing ? "quest-wax-breaking" : ""}`}
          aria-label="Sealed Quest"
        >
          {current.state === "sealed" && (
            <div className="flight-ticket-art">
              <img
                src={passArt}
                width={780}
                height={390}
                loading="lazy"
                alt="A sealed boarding pass on an airplane tray"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          {current.state === "open" && (
            <div className="flight-countdown" aria-label="Quest countdown">
              <span className="flight-countdown-label">DEPARTS IN</span>
              <strong>{left(current.destroy_at, now)}</strong>
              <span className="flight-countdown-speed">
                {current.opened_at && now < new Date(current.opened_at).getTime() + 3 * 3600000
                  ? `Finish in ${left(new Date(new Date(current.opened_at).getTime() + 3 * 3600000).toISOString(), now)} for +5`
                  : "Speed bonus window closed"}
              </span>
            </div>
          )}
          <div className="flight-ticket-body">
            <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase">
              <span className="text-blue inline-flex items-center gap-1">
                <Ticket size={15} /> Sealed Quest · Gate {current.drop_no}
              </span>
              <span>{current.value} pts</span>
            </div>
            {current.state === "sealed" && (
              <>
                <h2 className="font-display text-xl font-extrabold mt-3">
                  Your next quest is sealed.
                </h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Open before boarding closes. Once opened, you have 24 hours to finish.
                </p>
                <p className="flight-departure mt-3">
                  <Clock3 size={16} /> OPEN BY <strong>{left(current.open_by, now)}</strong>
                </p>
                <p className="text-xs text-muted-foreground mt-2">Finish in 3 hrs for +5</p>
                <Button
                  variant="playful"
                  className="flight-action w-full min-h-11 mt-4"
                  disabled={busy || revealing || viewOnly}
                  onClick={() => {
                    setRevealing(true);
                    hapticTap();
                    window.setTimeout(() => {
                      void act({ p_quest: current.id, p_action: "open" }).finally(() =>
                        setRevealing(false),
                      );
                    }, 600);
                  }}
                >
                  {revealing ? "Opening…" : "Open quest"}
                </Button>
              </>
            )}
            {current.state === "open" && (
              <div className="flight-ticket-reveal">
                <h2 className="font-display text-xl font-extrabold mt-3">{current.title}</h2>
                <p className="text-sm mt-2">{current.mission_text}</p>
                <p className="text-sm mt-2 text-muted-foreground">{current.backstory}</p>
                {insights[current.id] && (
                  <p className="text-sm mt-2">
                    <strong>The why · </strong>
                    {insights[current.id]}
                  </p>
                )}
                <label className="flight-action mt-4 flex min-h-11 items-center justify-center gap-2 rounded-full border border-border font-bold cursor-pointer">
                  <ImagePlus size={18} /> Upload a photo
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={busy || viewOnly}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(current, f);
                    }}
                  />
                </label>
                <Button
                  variant="outline"
                  className="w-full min-h-11 mt-2"
                  disabled={busy || viewOnly}
                  onClick={() =>
                    void act({ p_quest: current.id, p_action: "submit", p_mode: "show" })
                  }
                >
                  I'll show it at game night
                </Button>
              </div>
            )}
            {current.state === "counted" && (
              <p className="font-bold mt-3 inline-flex items-center gap-2">
                <Check size={18} /> Counted · +{current.points} pts
              </p>
            )}
            {current.state === "show_pending" && (
              <p className="font-bold mt-3">
                Show it at game night for your Captain or Co-Captain to approve.
              </p>
            )}
            {current.state === "declined" && (
              <p className="font-bold mt-3">Your proof was declined.</p>
            )}
            {current.state === "expired" && (
              <p className="font-bold mt-3">This quest expired unopened.</p>
            )}
            {current.state === "destroyed" && (
              <p className="flight-closed-label font-bold mt-3">
                Boarding closed · this quest self-destructed.
              </p>
            )}
          </div>
          {leader && feed.length > 0 && (
            <Button
              variant="ghost"
              className="w-full min-h-11"
              onClick={() => setProofOpen((v) => !v)}
              aria-expanded={proofOpen}
            >
              Quest proof · {feed.length}
            </Button>
          )}
        </section>
      )}
      {!proofOnly && showcase && (
        <section className="flight-ticket flight-showcase" aria-label="Your Showcase">
          <div className="flight-ticket-art">
            <img
              src={stageArt}
              width={780}
              height={390}
              loading="lazy"
              alt="A spotlight-lit stage in the cabin"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flight-ticket-body">
            <div className="flex justify-between text-xs font-bold uppercase">
              <span className="text-gold">Your Showcase</span>
              <span>{showcase.value} pts</span>
            </div>
            <h2 className="font-display text-xl font-extrabold mt-3">{showcase.title}</h2>
            <p className="text-sm mt-2">{showcase.mission_text}</p>
            {insights[showcase.id] && (
              <p className="text-sm mt-2">
                <strong>The why · </strong>
                {insights[showcase.id]}
              </p>
            )}
            <p className="text-sm mt-3 text-muted-foreground">
              {trip.kind === "trip"
                ? showcase.meetup_at
                  ? `Crowning meet-up · ${new Date(showcase.meetup_at).toLocaleString()}`
                  : "Crowning meet-up · not scheduled yet"
                : "Final game night"}
            </p>
            <p className="text-sm font-bold mt-3">
              {showcase.state === "approved"
                ? `Approved · +${showcase.points} pts`
                : showcase.state === "declined"
                  ? "Declined"
                  : "Not presented yet"}
            </p>
          </div>
        </section>
      )}
      {leader && feed.length > 0 && (proofOnly || proofOpen) && (
        <section className="flight-proof" aria-label="Quest proof">
          <h2 className="font-display font-extrabold">Quest proof</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Uploads count automatically. Decline what doesn't count.
          </p>
          <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory mt-3 pb-2">
            {feed.map((f) => (
              <div key={f.id} className="flight-proof-item snap-start">
                <p className="text-sm font-bold">
                  {name(f.user_id)} ·{" "}
                  {f.kind === "showcase"
                    ? "Showcase"
                    : f.kind === "season_bingo"
                      ? `Bingo · ${f.title}`
                      : f.kind === "season_scavenger"
                        ? `Scavenger · ${f.title}`
                        : f.kind === "season_speed"
                          ? `Speed · ${f.title}`
                          : f.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {f.value} pts{f.speed ? " +5 speed" : ""}
                </p>
                {f.proof_path && urls[f.proof_path] && (
                  <img
                    src={urls[f.proof_path]}
                    alt={`Proof from ${name(f.user_id)}`}
                    width={320}
                    height={240}
                    className="mt-2 w-full aspect-[4/3] object-cover rounded"
                  />
                )}
                {f.proof_mode === "show" && <p className="text-xs mt-2">Showing at game night</p>}
                <div className="flex gap-2 mt-3">
                  {(f.kind === "showcase" || f.state === "show_pending") && (
                    <Button
                      size="sm"
                      className="min-h-11"
                      disabled={busy || f.user_id === userId}
                      onClick={() => void act({ p_quest: f.id, p_action: "approve" })}
                    >
                      <Check size={16} /> Approve
                    </Button>
                  )}
                  {f.state !== "declined" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      disabled={busy || f.user_id === userId}
                      onClick={() =>
                        void (f.kind.startsWith("season_")
                          ? decline(f.id)
                          : act({ p_quest: f.id, p_action: "decline" }))
                      }
                    >
                      <X size={16} /> Decline
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
