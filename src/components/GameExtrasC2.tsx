import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (n: string, a?: object) => Promise<{ data: unknown; error: { message: string } | null }>;
};
const field = "w-full rounded-2xl border border-border bg-card px-3 py-2 text-sm";

/** Optional shared countdown. Only leaders/host can start it (server-checked); everyone sees it. */
export function ActivityTimer({ tripId, canRun }: { tripId: string; canRun: boolean }) {
  const [state, setState] = useState<{
    timer_ends_at: string | null;
    timer_label: string | null;
    timer_secs: number | null;
  } | null>(null);
  const [now, setNow] = useState(Date.now()),
    [custom, setCustom] = useState(""),
    [err, setErr] = useState("");
  const load = () =>
    void db
      .from("trip_play_state")
      .select("timer_ends_at,timer_label,timer_secs")
      .eq("trip_id", tripId)
      .maybeSingle()
      .then((r: { data: typeof state }) => setState(r.data));
  useEffect(() => {
    load();
    const p = setInterval(() => {
      if (!document.hidden) load();
    }, 5000);
    const channel = supabase
      .channel(`draw-timer-${tripId}-${Math.random()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_play_state", filter: `trip_id=eq.${tripId}` },
        load,
      )
      .subscribe();
    return () => {
      clearInterval(p);
      void supabase.removeChannel(channel);
    };
  }, [tripId]);
  const ends = state?.timer_ends_at ? new Date(state.timer_ends_at).getTime() : 0;
  const left = Math.max(0, Math.ceil((ends - now) / 1000));
  useEffect(() => {
    if (!ends || ends < Date.now() - 3000) return;
    const t = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 250);
    return () => clearInterval(t);
  }, [ends]);
  async function set(secs: number | null, label: string | null = null) {
    setErr("");
    const r = await db.rpc("set_activity_timer", { p_trip: tripId, p_secs: secs, p_label: label });
    if (r.error) setErr(friendlyError(r.error));
    setNow(Date.now());
    load();
  }
  const running = ends > now;
  // The private timer still recognizes only the legacy stored label; keep it for new draws too.
  const drawing = ["20-sec Draw", "30-sec Draw"].includes(state?.timer_label ?? "");
  async function extend() {
    setErr("");
    const r = await db.rpc("extend_draw_timer", { p_trip: tripId });
    if (r.error) setErr(friendlyError(r.error));
    setNow(Date.now());
    load();
  }
  if (!running && !canRun && !(ends && now - ends < 10000)) return null;
  return (
    <section className="app-card mt-5" aria-label="Timer">
      <p className="eyebrow text-blue">⏱️ TIMER</p>
      {ends > 0 && now - ends < 10000 && (
        <p
          className={`font-display text-4xl font-extrabold mt-2 tabular-nums ${running ? "" : "text-orange"}`}
          role="timer"
          aria-live="polite"
        >
          {running
            ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`
            : "Time's up!"}
        </p>
      )}
      {drawing && ends > 0 && now - ends < 60000 && (
        <QuickDrawPad key={state?.timer_ends_at ?? "pad"} locked={!running} />
      )}
      {canRun && (
        <>
          {running && drawing && (
            <Button
              variant="outline"
              className="w-full mt-3"
              disabled={(state?.timer_secs ?? 30) >= 60}
              onClick={() => void extend()}
            >
              +10 sec
            </Button>
          )}
          {running ? (
            <Button variant="outline" className="w-full mt-3" onClick={() => void set(null)}>
              Stop timer
            </Button>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
              {(
                [
                  [30, "30-sec Draw"],
                  [60, "1 min"],
                  [120, "2 min"],
                  [300, "5 min"],
                ] as const
              ).map(([s, l]) => (
                <Button
                  key={s}
                  size="sm"
                  variant="outline"
                  onClick={() => void set(s, s === 30 ? "20-sec Draw" : null)}
                >
                  {l}
                </Button>
              ))}
            </div>
          )}
          {!running && (
            <div className="flex gap-2 mt-2">
              <input
                className={field}
                inputMode="numeric"
                placeholder="Custom seconds"
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))}
              />
              <Button size="sm" disabled={!custom} onClick={() => void set(Number(custom))}>
                Start
              </Button>
            </div>
          )}
        </>
      )}
      {err && (
        <p role="alert" className="text-sm text-destructive mt-2">
          {err}
        </p>
      )}
    </section>
  );
}

const SONGS: [string, string][] = [
  ["Dancing Queen", "ABBA"],
  ["Don't Stop Believin'", "Journey"],
  ["I Wanna Dance with Somebody", "Whitney Houston"],
  ["Uptown Funk", "Bruno Mars"],
  ["Shallow", "Lady Gaga & Bradley Cooper"],
  ["Sweet Caroline", "Neil Diamond"],
];

/** Sing-off / Fave Tune: each player picks a song "disc" (title + artist only). Music plays outside the app; no lyrics or audio. */
export function SingOff({
  tripId,
  userId,
  names,
  canRun,
  onVote,
  onPick,
  winnerId,
}: {
  tripId: string;
  userId: string;
  names: Record<string, string>;
  canRun: boolean;
  onVote?: (options: string[]) => Promise<void>;
  onPick?: ((id: string) => Promise<void>) | undefined;
  winnerId?: string | null | undefined;
}) {
  const [discs, setDiscs] = useState<{ user_id: string; title: string; artist: string }[]>([]);
  const [title, setTitle] = useState(""),
    [artist, setArtist] = useState(""),
    [msg, setMsg] = useState("");
  const load = () =>
    void db
      .from("song_discs")
      .select("user_id,title,artist")
      .eq("trip_id", tripId)
      .order("created_at")
      .then((r: { data: typeof discs | null }) => setDiscs(r.data ?? []));
  useEffect(() => {
    load();
  }, [tripId]);
  const mine = discs.find((d) => d.user_id === userId);
  async function save(t: string, a: string) {
    setMsg("");
    const r = await db.rpc("set_song_disc", { p_trip: tripId, p_title: t, p_artist: a });
    if (r.error) setMsg(friendlyError(r.error));
    else {
      setTitle("");
      setArtist("");
      load();
    }
  }
  return (
    <section className="app-card mt-5" aria-label="Sing-off">
      <p className="eyebrow text-primary">🎤 SING-OFF · FAVE TUNE</p>
      <p className="text-sm text-muted-foreground mt-2">
        Pick your song disc, play it from your own music app or on the call, then the squad votes
        for the best performance.
      </p>
      <div className="mt-3 space-y-2">
        {discs.length === 0 ? (
          <p className="text-sm font-bold">No discs yet — be first!</p>
        ) : (
          discs.map((d) => (
            <div key={d.user_id} className="flex items-center gap-3 rounded-2xl bg-muted p-3">
              <span className="text-2xl" aria-hidden>
                💿
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold truncate">{d.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {d.artist} · {d.user_id === userId ? "You" : (names[d.user_id] ?? "Player")}
                </p>
              </div>
              {onPick && canRun && !winnerId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void onPick(d.user_id).catch((e) => setMsg(friendlyError(e)))}
                >
                  Pick winner
                </Button>
              )}
              {winnerId === d.user_id && (
                <span className="text-green text-xs font-extrabold">Winner ✓</span>
              )}
            </div>
          ))
        )}
      </div>
      {mine ? (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => void save("", "")}>
          Change my disc
        </Button>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {SONGS.map(([t, a]) => (
              <Button
                key={t}
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  setTitle(t);
                  setArtist(a);
                }}
              >
                {t}
              </Button>
            ))}
          </div>
          <input
            className={`${field} mt-2`}
            maxLength={80}
            placeholder="Song title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className={`${field} mt-2`}
            maxLength={60}
            placeholder="Artist"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
          />
          <Button
            variant="playful"
            className="w-full mt-2"
            disabled={!title.trim() || !artist.trim()}
            onClick={() => void save(title, artist)}
          >
            💿 Drop my disc
          </Button>
        </>
      )}
      {canRun && discs.length >= 2 && !onPick && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          {onVote && (
            <Button
              variant="green"
              onClick={() =>
                void onVote(
                  discs
                    .slice(0, 4)
                    .map(
                      (d) =>
                        `${d.title} — ${d.user_id === userId ? "You" : (names[d.user_id] ?? "Player")}`,
                    )
                    .map((s) => s.slice(0, 60)),
                )
                  .then(() => setMsg("Vote posted ✓"))
                  .catch((e) => setMsg(friendlyError(e)))
              }
            >
              🗳️ Vote best performance
            </Button>
          )}
          <Button
            variant="outline"
            className={onVote ? "" : "col-span-2"}
            onClick={async () => {
              const r = await db.rpc("clear_song_discs", { p_trip: tripId });
              if (r.error) setMsg(friendlyError(r.error));
              else load();
            }}
          >
            Clear discs
          </Button>
        </div>
      )}
      {msg && (
        <p role="status" className="text-sm mt-2">
          {msg}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground mt-3">
        TripJunkies only saves the song name and artist — never lyrics or audio.
      </p>
    </section>
  );
}

/** Each player's own local sketch pad for live draw rounds. Nothing is saved or sent. */
function QuickDrawPad({ locked }: { locked: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null),
    down = useRef(false),
    history = useRef<ImageData[]>([]);
  const [count, setCount] = useState(0);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3),
      r = c.getBoundingClientRect();
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = getComputedStyle(c).color || "currentColor";
  }, []);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (locked) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    history.current.push(ctx.getImageData(0, 0, e.currentTarget.width, e.currentTarget.height));
    setCount(history.current.length);
    down.current = true;
    const [x, y] = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!down.current || locked) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const [x, y] = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const end = () => {
    down.current = false;
  };
  const undo = () => {
    const c = ref.current,
      last = history.current.pop();
    if (c && last) c.getContext("2d")?.putImageData(last, 0, 0);
    setCount(history.current.length);
  };
  const clear = () => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    history.current.push(ctx.getImageData(0, 0, c.width, c.height));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    setCount(history.current.length);
  };
  return (
    <div className="mt-3" aria-label="Your quick-draw pad">
      <canvas
        ref={ref}
        className="block w-full aspect-[4/3] rounded-2xl border border-border bg-card text-foreground touch-none"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
        aria-label="Drawing canvas"
      />
      {locked ? (
        <p className="mt-2 text-sm font-bold" role="status">
          Time's up · Show your drawing to the squad
        </p>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" disabled={!count} onClick={undo}>
            Undo
          </Button>
          <Button size="sm" variant="outline" onClick={clear}>
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
