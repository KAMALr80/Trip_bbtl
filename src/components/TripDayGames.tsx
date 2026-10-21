import { confirmInApp } from "@/lib/confirm";
import { safeSetItem } from "@/lib/safe-storage";
import { friendlyError } from "@/lib/friendly-error";
import { challengeCategory, CATEGORY_EMOJI } from "@/lib/challenge-category";
import { ContentVote } from "@/components/ContentVote";
import { askCredits, creditError } from "@/components/AiCredits";
import { nudgeTopUp } from "@/lib/content.functions";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Crown, Eye, Pencil, RefreshCw, Sparkles, ThumbsUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/PlayerCards";
import { StampBadge } from "@/components/StampBadge";
import { Confetti, StampThunk } from "@/components/Season";
import { prepareTripDay } from "@/lib/trip-day.functions";
import { compressImage } from "@/lib/compress-image";
import {
  bingoProofKey,
  pendingBingo,
  retryBingoProof,
  savePendingBingo,
} from "@/lib/pending-bingo";
import {
  EXPLORER_SQUARES,
  FALLBACK_QUESTS,
  FIND_IT_SAFETY,
  SECRET_MISSIONS,
  AIRPORT_MISSIONS,
  DAY_CAP,
  dayTag,
  gamesFor,
  seededShuffle,
  tagEmoji,
} from "@/lib/trip-games";
import { loadItinerary, tripDates, tripToday, tripTz, type DayTag } from "@/lib/itinerary";
import type { Member, TripWithRole } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";
import type { Tables } from "@/integrations/supabase/types";
import { ActivityAlternative, type Activity, type ActivitySwap } from "./ActivityAlternative";

type Day = Tables<"trip_day_games">;
type QuestPost = Tables<"quest_posts">;
type QuestChallenge = Tables<"quest_challenges">;
type SeasonRow = {
  user_id: string;
  stamps: number;
  today_stamps: number;
  max_stamps: number;
  score?: number;
  carry_on?: number;
};
type Props = {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  viewOnly?: boolean;
};

const field = "w-full h-12 rounded-xl bg-card border-2 border-border px-3 text-foreground";
const isLeader = (t: TripWithRole) => t.myRole === "captain" || t.myRole === "co_captain";
const strs = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
export const tripIsLive = (t: TripWithRole) => {
  const d = tripToday(tripTz(t));
  return d >= t.start_date && d <= t.end_date;
};
export const tripHasStarted = (t: TripWithRole) => tripToday(tripTz(t)) >= t.start_date;

function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative bg-card rounded-t-3xl w-full max-w-lg p-6 pb-10 max-h-[88dvh] overflow-y-auto animate-slide-up"
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4"
          aria-label="Close"
          onClick={onClose}
        >
          <X />
        </Button>
        {children}
      </div>
    </div>
  );
}

function PhotoSheet({
  title,
  hint,
  required,
  onClose,
  onSubmit,
  onSkip,
}: {
  title: string;
  hint: string;
  required?: boolean | undefined;
  onClose: () => void;
  onSubmit: (file: File | null) => Promise<void>;
  onSkip?: (() => Promise<void>) | undefined;
}) {
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState("");
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  async function go(f: File | null) {
    setBusy(true);
    setErr("");
    try {
      await onSubmit(f);
      onClose();
    } catch (e) {
      setErr(friendlyError(e));
    }
    setBusy(false);
  }
  return (
    <Sheet label={title} onClose={onClose}>
      <h3 className="font-display text-2xl font-extrabold pr-10">{title}</h3>
      <p className="text-sm text-ink-soft mt-1">{hint}</p>
      <label className="mt-5 grid place-items-center h-48 rounded-2xl border-2 border-dashed border-border bg-blue-soft overflow-hidden cursor-pointer">
        {preview ? (
          <img src={preview} alt="Your photo" className="h-full w-full object-cover" />
        ) : (
          <span className="text-center font-bold text-blue">
            <Camera className="mx-auto mb-1" />
            Tap to add a photo
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {err && (
        <p role="alert" className="text-sm text-destructive mt-3">
          {err}
        </p>
      )}
      <Button
        variant="playful"
        className="w-full mt-5 h-14"
        disabled={busy || (required && !file)}
        onClick={() => go(file)}
      >
        {busy
          ? "Saving…"
          : file
            ? "Post it 🚀"
            : required
              ? "Add a photo first"
              : "Mark it done ✅"}
      </Button>
      {!required && file && (
        <Button variant="ghost" className="w-full mt-2" disabled={busy} onClick={() => go(null)}>
          Skip the photo
        </Button>
      )}
      {onSkip && (
        <Button
          variant="outline"
          className="w-full mt-2 bg-card"
          disabled={busy}
          onClick={async () => {
            if (
              !(await confirmInApp(
                "Use a skip pass 🎟️ to swap this for a new one? No stamps for this one.",
              ))
            )
              return;
            setBusy(true);
            setErr("");
            try {
              await onSkip();
              onClose();
            } catch (e) {
              setErr(friendlyError(e));
            }
            setBusy(false);
          }}
        >
          🎟️ Swap it (use a skip pass)
        </Button>
      )}
    </Sheet>
  );
}

function Section({
  emoji,
  title,
  sub,
  tint,
  children,
}: {
  emoji: string;
  title: string;
  sub: string;
  tint: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`trip-day-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      className={`mt-5 rounded-[1.75rem] border-2 border-dashed border-border p-5 ${tint}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl">{emoji}</span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-extrabold">{title}</h2>
          <p className="text-xs font-bold text-ink-soft">{sub}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function TripDayGames({ trip, members, cards, userId, viewOnly = false }: Props) {
  const date = tripToday(tripTz(trip));
  const prepare = useServerFn(prepareTripDay);
  const [day, setDay] = useState<Day | null>(null),
    [err, setErr] = useState(""),
    [loading, setLoading] = useState(true);
  const [marks, setMarks] = useState<Tables<"bingo_marks">[]>([]),
    [posts, setPosts] = useState<QuestPost[]>([]),
    [thumbs, setThumbs] = useState<Tables<"quest_thumbs">[]>([]);
  const [questChallenges, setQuestChallenges] = useState<QuestChallenge[]>([]);
  const [trivia, setTrivia] = useState<Tables<"trivia_answers">[]>([]),
    [missions, setMissions] = useState<Tables<"secret_missions">[]>([]),
    [mVotes, setMVotes] = useState<Tables<"mission_votes">[]>([]);
  const [photos, setPhotos] = useState<Tables<"photo_posts">[]>([]),
    [myVotes, setMyVotes] = useState<Tables<"day_votes">[]>([]),
    [claims, setClaims] = useState<Tables<"airport_claims">[]>([]);
  const [season, setSeason] = useState<SeasonRow[]>([]),
    [urls, setUrls] = useState<Record<string, string>>({}),
    [sheet, setSheet] = useState<null | {
      title: string;
      hint: string;
      required?: boolean;
      bingoSquare?: number;
      run: (path: string | null) => PromiseLike<{ error: { message: string } | null }>;
      skip?: (() => Promise<void>) | undefined;
    }>(null);
  const [skips, setSkips] = useState<string[]>([]);
  const [pendingProofs, setPendingProofs] = useState<number[]>([]);
  const [dayStatus, setDayStatus] = useState<string>("game");
  const [adultActivities, setAdultActivities] = useState<Activity[]>([]),
    [alternatives, setAlternatives] = useState<ActivitySwap[]>([]);
  const [peek, setPeek] = useState(false),
    [burst, setBurst] = useState(0),
    [edit, setEdit] = useState(false),
    [wheels, setWheels] = useState(""),
    [guess, setGuess] = useState("");
  const card = (id: string) => cards.find((c) => c.user_id === id);
  const nameOf = (id: string) =>
    card(id)?.game_name || members.find((m) => m.user_id === id)?.display_name || "Player";

  async function refresh() {
    const extras = supabase as unknown as { from: (table: string) => any };
    void (supabase as unknown as { rpc: (f: string, x: object) => PromiseLike<{ data: unknown }> })
      .rpc("game_day_status", { p_trip: trip.id, p_date: date })
      .then(({ data }) => {
        if (typeof data === "string") setDayStatus(data);
      });
    const [adultResult, alternativeResult] = await Promise.all([
      extras
        .from("trip_adult_activities")
        .select("kind,item_index,prompt,alternative,options")
        .eq("trip_id", trip.id)
        .eq("day_date", date),
      extras
        .from("trip_item_alternatives")
        .select("kind,item_index,user_id,alternative")
        .eq("trip_id", trip.id)
        .eq("day_date", date),
    ]);
    if (!adultResult.error) setAdultActivities(adultResult.data ?? []);
    else {
      setAdultActivities([]);
      console.error("21+ activities load failed", adultResult.error);
    }
    if (!alternativeResult.error) setAlternatives(alternativeResult.data ?? []);
    else console.error("Activity alternatives load failed", alternativeResult.error);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = (t: string): any =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from(t as "bingo_marks").select("*") as any).eq("trip_id", trip.id);
    const [d, b, qp, th, qc, tr, sm, mv, pp, dv, ac, s] = await Promise.all([
      supabase
        .from("trip_day_games")
        .select("*")
        .eq("trip_id", trip.id)
        .eq("day_date", date)
        .maybeSingle(),
      q("bingo_marks").eq("day_date", date),
      q("quest_posts").eq("day_date", date),
      q("quest_thumbs"),
      q("quest_challenges"),
      q("trivia_answers").eq("day_date", date),
      q("secret_missions").eq("day_date", date),
      q("mission_votes").eq("day_date", date),
      q("photo_posts").eq("day_date", date),
      q("day_votes").eq("day_date", date),
      q("airport_claims").eq("day_date", date),
      supabase.rpc("trip_season_score", { p_trip: trip.id }),
    ]);
    void (supabase.from("skip_passes" as "bingo_marks").select("ref") as any)
      .eq("trip_id", trip.id)
      .eq("user_id", userId)
      .then(({ data }: { data: { ref: string }[] | null }) =>
        setSkips((data ?? []).map((x) => x.ref)),
      );
    const failure = (
      [d, b, qp, th, qc, tr, sm, mv, pp, dv, ac, s] as { error: { message: string } | null }[]
    ).find((r) => r.error)?.error;
    if (failure) {
      setErr(friendlyError(failure));
      return;
    }
    const removedRes = await supabase
      .from("photo_removed")
      .select("photo_path")
      .eq("trip_id", trip.id);
    const removed = new Set((removedRes.data ?? []).map((r) => r.photo_path));
    const keep = <R extends { photo_path?: string | null }>(rows: R[] | null) =>
      (rows ?? []).filter((r) => !r.photo_path || !removed.has(r.photo_path));
    qp.data = keep(qp.data as never) as never;
    pp.data = keep(pp.data as never) as never;
    b.data = keep(b.data as never) as never;
    ac.data = keep(ac.data as never) as never;
    setDay(d.data);
    setMarks(b.data as never);
    setPosts(qp.data as never);
    setThumbs(th.data as never);
    setQuestChallenges(qc.data as never);
    setTrivia(tr.data as never);
    setMissions(sm.data as never);
    setMVotes(mv.data as never);
    setPhotos(pp.data as never);
    setMyVotes(dv.data as never);
    setClaims(ac.data as never);
    setSeason(s.data ?? []);
    const paths = [...(qp.data ?? []), ...(pp.data ?? []), ...(b.data ?? []), ...(ac.data ?? [])]
      .map((p: { photo_path: string | null }) => p.photo_path)
      .filter((p): p is string => !!p);
    const fresh = paths.filter((p) => !urls[p]);
    if (fresh.length) {
      const { data } = await supabase.storage.from("trip-photos").createSignedUrls(fresh, 3600);
      if (data)
        setUrls((u) => ({
          ...u,
          ...Object.fromEntries(
            data
              .filter((x) => x.signedUrl && x.path)
              .map((x) => [x.path as string, x.signedUrl as string]),
          ),
        }));
    }
  }
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!viewOnly) {
        try {
          await prepare({ data: { tripId: trip.id, date } });
          nudgeTopUp(trip.id);
        } catch (e) {
          if (alive) setErr(friendlyError(e));
        }
      }
      await refresh();
      if (alive) setLoading(false);
    })();
    const t = window.setInterval(() => void refresh(), 15000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [trip.id, date, viewOnly]);

  const proofKey = (square: number) => bingoProofKey(userId, trip.id, date, square);
  useEffect(() => {
    let live = true;
    const check = async () => {
      const found = await Promise.all(
        Array.from({ length: 9 }, async (_, i) => ((await pendingBingo(proofKey(i))) ? i : -1)),
      );
      if (live) setPendingProofs(found.filter((i) => i >= 0));
      for (const i of found.filter((i) => i >= 0)) {
        if ((await retryBingoProof(proofKey(i))) && live) {
          setPendingProofs((rows) => rows.filter((x) => x !== i));
          await refresh();
        }
      }
    };
    void check().catch(() => {});
    window.addEventListener("online", check);
    const interval = window.setInterval(() => void check().catch(() => {}), 30000);
    return () => {
      live = false;
      window.removeEventListener("online", check);
      window.clearInterval(interval);
    };
  }, [trip.id, date, userId]);
  async function saveBingo(square: number, file: File | null) {
    const mark = async (path: string | null) =>
      supabase.rpc("mark_bingo", {
        p_trip: trip.id,
        p_date: date,
        p_square: square,
        p_photo: path as string,
      });
    if (!file) {
      if (trip.bingo_needs_photo)
        throw new Error(
          "Add a photo to clear this square, or take one and we’ll save it as Proof pending if upload fails.",
        );
      const result = await mark(null);
      if (result.error) throw result.error;
      await refresh();
      return;
    }
    const compressed = await compressImage(file);
    try {
      const path = `${trip.id}/${userId}/${date}-${crypto.randomUUID()}.${compressed.type === "image/webp" ? "webp" : "jpg"}`;
      const uploaded = await supabase.storage
        .from("trip-photos")
        .upload(path, compressed, { contentType: compressed.type });
      if (uploaded.error) throw uploaded.error;
      const result = await mark(path);
      if (result.error) throw result.error;
    } catch {
      const result = await mark(null);
      try {
        await savePendingBingo({
          key: proofKey(square),
          userId,
          tripId: trip.id,
          date,
          square,
          file: compressed,
        });
        setPendingProofs((rows) => [...new Set([...rows, square])]);
        if (result.error)
          setErr(
            "Proof saved on this device. Connect to sync this square and its points with your squad.",
          );
      } catch {
        setErr(
          "Proof marked, but this browser could not save the photo for retry. Please keep your photo and add it again when online.",
        );
      }
    }
    await refresh();
  }
  async function upload(raw: File | null) {
    if (!raw) return null;
    const file = await compressImage(raw);
    const path = `${trip.id}/${userId}/${date}-${crypto.randomUUID()}.${file.type === "image/webp" ? "webp" : "jpg"}`;
    const { error } = await supabase.storage
      .from("trip-photos")
      .upload(path, file, { contentType: file.type });
    if (error)
      throw new Error(
        /row-level|policy|unauthorized/i.test(error.message)
          ? "That's 15 photos for today 📸 — you've hit the daily limit. Fresh slots tomorrow!"
          : "Photo upload failed. Try again.",
      );
    return path;
  }
  async function rpc(run: () => PromiseLike<{ error: { message: string } | null }>) {
    setErr("");
    const { error } = await run();
    if (error) setErr(friendlyError(error));
    await refresh();
    return !error;
  }

  const me = season.find((s) => s.user_id === userId);
  const swapped = (list: string[], ref: string, i: number, fallback: string) =>
    skips.includes(ref)
      ? (seededShuffle(
          list.filter((x) => x !== fallback),
          `${trip.id}${userId}${ref}`,
        )[0] ?? fallback)
      : fallback;
  async function skipItem(kind: string, ref: string, next?: string) {
    const { error } = await (
      supabase as unknown as {
        rpc: (f: string, a: object) => PromiseLike<{ error: { message: string } | null }>;
      }
    ).rpc("use_skip", { p_trip: trip.id, p_kind: kind, p_ref: ref, p_new: next ?? null });
    if (error) throw new Error(error.message);
    await refresh();
  }
  const tag = (day?.tag ?? "Explore") as DayTag;
  const cap = DAY_CAP(tag);
  if (loading)
    return (
      <div aria-busy="true" aria-label="Loading today's games" className="py-6 space-y-4">
        <div className="skeleton-shimmer h-8 w-48 rounded-lg bg-muted" />
        <div className="skeleton-shimmer h-24 rounded-lg bg-muted" />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="skeleton-shimmer aspect-square rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  if ((dayStatus === "rest" || dayStatus === "hidden") && !isLeader(trip))
    return (
      <div className="py-12 text-center">
        <p className="text-5xl">😴</p>
        <h1 className="font-display text-2xl font-extrabold mt-3">Rest day</h1>
        <p className="text-sm text-muted-foreground mt-2">
          No games today — explore, nap, eat something great. Photos still welcome on the wall 📸
        </p>
      </div>
    );
  if (!day && !isLeader(trip) && !err)
    return (
      <div className="py-12 text-center">
        <p className="text-5xl">🔒</p>
        <h1 className="font-display text-2xl font-extrabold mt-3">Today's itinerary is locked</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Your Captain releases them soon. Bingo, quests and photos are waiting 👀
        </p>
        <div
          className="grid grid-cols-3 gap-2 mt-6 max-w-64 mx-auto opacity-60"
          aria-label="Locked bingo preview"
        >
          {["📸", "🍜", "🌴", "🛵", "🔒", "🎉", "🗺️", "🛍️", "🌅"].map((e, i) => (
            <div
              key={i}
              className="aspect-square rounded-2xl bg-muted grid place-items-center text-2xl blur-[1px]"
            >
              {e}
            </div>
          ))}
        </div>
        <Button variant="outline" className="mt-6" onClick={() => void refresh()}>
          Check again
        </Button>
      </div>
    );
  if (!day)
    return (
      <div className="py-16 text-center">
        <p className="text-5xl">🧳</p>
        <h1 className="font-display text-2xl font-extrabold mt-3">
          Today's itinerary is almost ready
        </h1>
        {err && (
          <p role="alert" className="text-sm text-destructive mt-2">
            {err}
          </p>
        )}
        <Button variant="playful" className="mt-5" onClick={() => location.reload()}>
          Try again
        </Button>
      </div>
    );

  const bingo = strs(day.bingo),
    order = seededShuffle([...Array(bingo.length).keys()], userId + date);
  const myMarks = new Set(marks.filter((m) => m.user_id === userId).map((m) => m.square));
  const quests = strs(day.quests),
    questions = (Array.isArray(day.trivia) ? day.trivia : []) as { q: string; options: string[] }[];
  const adultItem = (kind: Activity["kind"], index: number) =>
    adultActivities.find((a) => a.kind === kind && a.item_index === index);
  const captainId = members.find((m) => m.role === "captain")?.user_id;
  const host =
    trip.myRole === "captain" ||
    members.some((m) => m.user_id === userId && m.role === "co_captain");
  const display = (kind: Activity["kind"], index: number, base: string) => {
    const adult = adultItem(kind, index);
    const personal = alternatives.find(
      (a) => a.kind === kind && a.item_index === index && a.user_id === userId,
    );
    const group = alternatives.find(
      (a) => a.kind === kind && a.item_index === index && a.user_id === captainId,
    );
    return personal?.alternative || group?.alternative || adult?.prompt || base;
  };
  const alt = (kind: Activity["kind"], index: number, base: string) => (
    <ActivityAlternative
      tripId={trip.id}
      date={date}
      kind={kind}
      index={index}
      userId={userId}
      captainId={captainId}
      host={host}
      defaultText={adultItem(kind, index)?.prompt || base}
      swaps={alternatives}
      onChanged={() => void refresh()}
    />
  );
  const myMission = missions.find((m) => m.user_id === userId),
    revealed = missions.filter((m) => m.revealed_at && m.user_id !== userId);
  const myVote = (k: string) => myVotes.find((v) => v.kind === k)?.choice_id;
  const airport = (Array.isArray(day.airport) ? day.airport : []) as number[];
  const others = members.filter((m) => m.user_id !== userId);

  return (
    <div className="pb-6">
      <Confetti burst={burst} />
      <StampThunk total={me?.stamps ?? 0} />
      <p className="text-sm font-bold text-muted-foreground">
        TODAY'S ITINERARY ·{" "}
        {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        })}
      </p>
      <h1 className="font-display text-4xl font-extrabold mt-1">
        {tagEmoji[tag]} {tag} day
      </h1>
      <p className="text-ink-soft font-bold">{day.city}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-orange text-primary-foreground p-4">
          <p className="text-xs font-extrabold opacity-90">TODAY</p>
          <p className="font-display text-3xl font-extrabold">
            {me?.today_stamps ?? 0}
            <span className="text-lg opacity-80">/{cap}</span>
          </p>
          <p className="text-xs font-bold">stamps</p>
        </div>
        <div className="rounded-2xl bg-blue text-primary-foreground p-4">
          <p className="text-xs font-extrabold opacity-90">TRIP SEASON</p>
          <p className="font-display text-3xl font-extrabold">
            {me
              ? Math.min(100, me.max_stamps ? Math.round((me.stamps / me.max_stamps) * 100) : 0)
              : 0}
            <span className="text-lg opacity-80">/100</span>
          </p>
          <p className="text-xs font-bold">🛂 {me?.stamps ?? 0} stamps total</p>
        </div>
      </div>
      {dayStatus === "surprise" && (
        <div className="mt-4 rounded-2xl bg-pink-soft p-4 text-center">
          <p className="font-display text-xl font-extrabold">🎲 Surprise! Today's a game day</p>
        </div>
      )}
      {isLeader(trip) && (dayStatus === "rest" || dayStatus === "hidden") && (
        <div className="mt-4 rounded-2xl bg-blue-soft p-4">
          <p className="font-bold">😴 It's a rest day for the squad</p>
          <p className="text-xs text-ink-soft mt-1">
            Players see a rest-day screen. Change game days in Captain Tools.
          </p>
        </div>
      )}
      {isLeader(trip) && !viewOnly && !(day as { released_at?: string | null }).released_at && (
        <div className="mt-4 rounded-2xl bg-orange-soft p-4">
          <p className="font-bold">🔒 The squad can't see today's games yet</p>
          <p className="text-xs text-ink-soft mt-1">
            Bingo and games are ready from your dates and itinerary. Check them, then release.
          </p>
          <Button
            variant="playful"
            className="w-full mt-3"
            onClick={() =>
              void rpc(() => supabase.rpc("release_trip_day", { p_trip: trip.id, p_date: date }))
            }
          >
            Release today's games 🚀
          </Button>
        </div>
      )}
      {isLeader(trip) && (
        <Button variant="outline" className="mt-3 w-full bg-card" onClick={() => setEdit(true)}>
          <Pencil /> Edit today's games
        </Button>
      )}
      {err && (
        <p role="alert" className="text-sm text-destructive mt-3">
          {err}
        </p>
      )}

      {tag !== "Travel" && bingo.length === 9 && (
        <Section
          emoji="🎱"
          title="Daily Bingo"
          sub={`1 stamp per square · +4 for a full card · ${day.bingo_mode === "local" ? "Local squares" : "Explorer squares"}`}
          tint="bg-green-soft"
        >
          <div className="grid grid-cols-3 gap-2">
            {order.map((i) => {
              const pending = pendingProofs.includes(i),
                done = myMarks.has(i) || pending,
                photo = marks.find((m) => m.user_id === userId && m.square === i)?.photo_path,
                text = display(
                  "bingo",
                  i,
                  swapped(EXPLORER_SQUARES, `${date}:b${i}`, i, bingo[i]!),
                );
              return (
                <div key={i} className="min-w-0">
                  <Button
                    variant="outline"
                    className={`bingo-flip relative aspect-square w-full h-auto rounded-2xl p-2 text-[11px] leading-tight font-bold text-center grid place-items-center overflow-hidden whitespace-normal ${done ? "!bg-green !text-primary-foreground !border-green !opacity-100" : "bg-card border-2 border-border"}`}
                    onClick={() => {
                      if (done && !pending && photo) return;
                      setSheet({
                        title: pending ? "Retry your proof 📸" : "Snap it 📸",
                        hint: text,
                        required: trip.bingo_needs_photo && !pending,
                        bingoSquare: i,
                        skip: done
                          ? undefined
                          : skips.includes(`${date}:b${i}`)
                            ? undefined
                            : () => skipItem("bingo", `${date}:b${i}`),
                        run: async (path) => {
                          if (path) {
                            const result = await supabase.rpc("mark_bingo", {
                              p_trip: trip.id,
                              p_date: date,
                              p_square: i,
                              p_photo: path,
                            });
                            return result;
                          }
                          return supabase.rpc("mark_bingo", {
                            p_trip: trip.id,
                            p_date: date,
                            p_square: i,
                            p_photo: null as unknown as string,
                          });
                        },
                      });
                    }}
                  >
                    <span className="relative z-10">
                      {photo && urls[photo] && (
                        <img
                          src={urls[photo]}
                          alt="Your Bingo proof"
                          className="absolute inset-0 w-full h-full object-cover opacity-50"
                        />
                      )}
                      <span className="relative block">
                        {done ? (
                          <span className="block text-xs">
                            {pending ? "Proof pending · Retry upload" : "Cleared ✓"}
                          </span>
                        ) : (
                          <span className="block">{text}</span>
                        )}
                      </span>
                    </span>
                  </Button>
                  {pending && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-[10px]"
                      onClick={() =>
                        void retryBingoProof(proofKey(i)).then((ok) => {
                          if (ok) {
                            setPendingProofs((rows) => rows.filter((x) => x !== i));
                            void refresh();
                          }
                        })
                      }
                    >
                      Retry upload
                    </Button>
                  )}
                  {alt("bingo", i, text)}
                </div>
              );
            })}
          </div>
          <p className="text-xs font-bold text-ink-soft mt-3">
            {new Set([...myMarks, ...pendingProofs]).size}/9 squares
            {new Set([...myMarks, ...pendingProofs]).size === 9 ? " · BINGO! 🎉" : ""}
          </p>
        </Section>
      )}

      {tag !== "Travel" && quests.length > 0 && (
        <Section
          emoji="🗺️"
          title="Daily Quests"
          sub="1 stamp on your word · 2 with a photo and two squad verifications"
          tint="bg-orange-soft"
        >
          <div className="space-y-3">
            {quests.map((qt, i) => {
              const mine = posts.find((p) => p.user_id === userId && p.quest === i);
              const feed = posts.filter((p) => p.quest === i);
              return (
                <div key={i} className="bg-card rounded-2xl p-4">
                  {(() => {
                    const c = challengeCategory(
                      String(display("quest", i, swapped(FALLBACK_QUESTS, `${date}:q${i}`, i, qt))),
                    );
                    return (
                      <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-extrabold text-muted-foreground mb-1">
                        {CATEGORY_EMOJI[c]} {c}
                      </span>
                    );
                  })()}
                  <p className="font-bold">
                    {adultItem("quest", i) && (
                      <span className="text-orange block text-xs">sip or skip</span>
                    )}
                    {display("quest", i, swapped(FALLBACK_QUESTS, `${date}:q${i}`, i, qt))}
                    {skips.includes(`${date}:q${i}`) && <span className="ml-1 text-xs">🎟️</span>}
                  </p>
                  {alt("quest", i, qt)}
                  <p className="text-xs mt-2 font-semibold">{FIND_IT_SAFETY}</p>
                  {!viewOnly && (
                    <div className="flex justify-end -mb-1">
                      <ContentVote tripId={trip.id} kind="quest" text={qt} />
                    </div>
                  )}
                  {mine ? (
                    <p className="text-xs font-bold text-green mt-1">
                      {mine.photo_path
                        ? `Photo posted · ${thumbs.filter((t) => t.post_id === mine.id).length}/2 verifications`
                        : "Cleared ✓ · +1 on your word"}
                    </p>
                  ) : (
                    <Button
                      size="sm"
                      variant="playful"
                      className="mt-2"
                      onClick={() =>
                        setSheet({
                          title: "Quest done? 🗺️",
                          hint: display(
                            "quest",
                            i,
                            swapped(FALLBACK_QUESTS, `${date}:q${i}`, i, qt),
                          ),
                          skip: skips.includes(`${date}:q${i}`)
                            ? undefined
                            : () => skipItem("quest", `${date}:q${i}`),
                          run: (p) =>
                            supabase.rpc("post_quest", {
                              p_trip: trip.id,
                              p_date: date,
                              p_quest: i,
                              p_photo: p as string,
                            }),
                        })
                      }
                    >
                      <Camera /> I did it
                    </Button>
                  )}
                  {feed.length > 0 && (
                    <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                      {feed.map((p) => {
                        const n = thumbs.filter((t) => t.post_id === p.id).length,
                          gave = thumbs.some((t) => t.post_id === p.id && t.user_id === userId),
                          challenge = questChallenges.find((c) => c.post_id === p.id);
                        return (
                          <div key={p.id} className="shrink-0 w-36">
                            <div className="h-28 rounded-xl bg-muted overflow-hidden">
                              {p.photo_path && urls[p.photo_path] ? (
                                <img
                                  src={urls[p.photo_path]}
                                  alt={`${nameOf(p.user_id)}'s quest`}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="grid place-items-center h-full text-xs font-bold">
                                  On their word · +1
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-bold truncate mt-1">
                              {nameOf(p.user_id)} ·{" "}
                              {challenge?.decision === false
                                ? "Not counted"
                                : p.photo_path
                                  ? challenge?.decision || n >= 2
                                    ? "+2"
                                    : "Awaiting verification"
                                  : "+1"}
                            </p>
                            {p.user_id !== userId &&
                              p.photo_path &&
                              challenge?.decision == null && (
                                <Button
                                  size="sm"
                                  variant={gave ? "green" : "subtle"}
                                  className="h-8 w-full mt-1"
                                  disabled={gave}
                                  onClick={() =>
                                    rpc(() => supabase.rpc("thumb_quest", { p_post: p.id }))
                                  }
                                >
                                  <ThumbsUp /> {n}/2
                                </Button>
                              )}
                            {p.user_id !== userId && !challenge && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-full text-xs"
                                onClick={() =>
                                  rpc(() =>
                                    supabase.rpc("quest_review", {
                                      p_post: p.id,
                                      p_action: "challenge",
                                    }),
                                  )
                                }
                              >
                                Challenge
                              </Button>
                            )}
                            {challenge?.decision == null &&
                              isLeader(trip) &&
                              trip.myRole === "captain" && (
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 flex-1 px-1"
                                    onClick={() =>
                                      rpc(() =>
                                        supabase.rpc("quest_review", {
                                          p_post: p.id,
                                          p_action: "approve",
                                        }),
                                      )
                                    }
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 flex-1 px-1"
                                    onClick={() =>
                                      rpc(() =>
                                        supabase.rpc("quest_review", {
                                          p_post: p.id,
                                          p_action: "reject",
                                        }),
                                      )
                                    }
                                  >
                                    Reject
                                  </Button>
                                </div>
                              )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {tag === "Chill" && (
        <Section
          emoji="🧠"
          title="Chill Night Trivia"
          sub="6 questions · 1 stamp per correct answer"
          tint="bg-blue-soft"
        >
          {questions.length === 0 ? (
            <p className="text-sm font-bold">
              Trivia is still being written.{" "}
              {isLeader(trip) ? "Tap Edit → Refresh to try again." : "Check back soon!"}
            </p>
          ) : (
            <div className="space-y-3">
              {questions.map((qq, i) => {
                const ans = trivia.find((a) => a.question === i);
                const adult = adultItem("trivia", i);
                const question = display("trivia", i, qq.q);
                const options = adult?.options || qq.options;
                return (
                  <div key={i} className="bg-card rounded-2xl p-4">
                    <p className="font-bold">
                      {i + 1}.{" "}
                      {adult && <span className="text-orange text-xs">sip or skip · </span>}
                      {question}
                    </p>
                    {alt("trivia", i, qq.q)}
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {options.map((o, j) => (
                        <Button
                          key={j}
                          size="sm"
                          variant={
                            ans?.choice === j ? (ans.correct ? "green" : "destructive") : "subtle"
                          }
                          className="h-auto min-h-10 whitespace-normal py-2"
                          disabled={!!ans}
                          onClick={() =>
                            rpc(() =>
                              supabase.rpc("answer_trivia", {
                                p_trip: trip.id,
                                p_date: date,
                                p_question: i,
                                p_choice: j,
                              }),
                            )
                          }
                        >
                          {o}
                        </Button>
                      ))}
                    </div>
                    {ans && (
                      <p className="text-xs font-bold mt-2">
                        {ans.correct ? "Correct! +1 🛂" : "Not quite!"}
                      </p>
                    )}
                  </div>
                );
              })}
              <p className="text-sm font-extrabold">
                Score: {trivia.filter((a) => a.correct).length}/6
              </p>
            </div>
          )}
        </Section>
      )}

      <Section
        emoji="📸"
        title="Photo Challenge"
        sub={`${day.photo_theme} · winner gets 3 stamps`}
        tint="bg-pink-soft"
      >
        {!photos.some((p) => p.user_id === userId) && (
          <Button
            variant="playful"
            onClick={() =>
              setSheet({
                title: day.photo_theme,
                hint: "One photo per person. The squad votes tonight.",
                required: true,
                run: (p) =>
                  supabase.rpc("post_photo", {
                    p_trip: trip.id,
                    p_date: date,
                    p_photo: p as string,
                  }),
              })
            }
          >
            <Camera /> Post my photo
          </Button>
        )}
        {photos.length === 0 ? (
          <p className="text-sm text-ink-soft mt-2">No photos yet — be the first!</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 mt-3">
            {photos.map((p) => {
              const chosen = myVote("photo") === p.user_id;
              return (
                <div
                  key={p.user_id}
                  className={`rounded-2xl overflow-hidden bg-card ${chosen ? "ring-4 ring-orange" : ""}`}
                >
                  <div className="aspect-square bg-muted">
                    {urls[p.photo_path] && (
                      <img
                        src={urls[p.photo_path]}
                        alt={`${nameOf(p.user_id)}'s photo`}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="p-2 flex items-center justify-between gap-1">
                    <span className="text-xs font-bold truncate">{nameOf(p.user_id)}</span>
                    {p.user_id !== userId && (
                      <Button
                        size="sm"
                        variant={chosen ? "playful" : "subtle"}
                        className="h-8 px-2"
                        onClick={() =>
                          rpc(() =>
                            supabase.rpc("cast_day_vote", {
                              p_trip: trip.id,
                              p_date: date,
                              p_kind: "photo",
                              p_choice: p.user_id,
                            }),
                          )
                        }
                      >
                        {chosen ? "Voted" : "Vote"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        emoji="🏅"
        title="Day MVP"
        sub="Vote tonight · winner gets 5 stamps · results tomorrow"
        tint="bg-green-soft"
      >
        {others.length === 0 ? (
          <p className="text-sm">Invite the squad to vote!</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {others.map((m) => {
              const chosen = myVote("mvp") === m.user_id;
              return (
                <button
                  key={m.user_id}
                  onClick={() =>
                    rpc(() =>
                      supabase.rpc("cast_day_vote", {
                        p_trip: trip.id,
                        p_date: date,
                        p_kind: "mvp",
                        p_choice: m.user_id,
                      }),
                    )
                  }
                  className={`rounded-2xl p-2 bg-card grid place-items-center gap-1 active:scale-95 transition-transform ${chosen ? "ring-4 ring-orange" : ""}`}
                >
                  <Avatar
                    url={card(m.user_id)?.avatarUrl}
                    name={nameOf(m.user_id)}
                    className="h-12 w-12"
                  />
                  <span className="text-[11px] font-bold truncate w-full text-center">
                    {nameOf(m.user_id)}
                  </span>
                  {chosen && <Crown size={14} className="text-orange" />}
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <YesterdayWinners trip={trip} date={date} nameOf={nameOf} />
      <TripSeasonBoard trip={trip} members={members} cards={cards} userId={userId} rows={season} />

      {sheet && (
        <PhotoSheet
          title={sheet.title}
          hint={sheet.hint}
          required={sheet.required}
          onSkip={sheet.skip}
          onClose={() => setSheet(null)}
          onSubmit={async (f) => {
            if (sheet.bingoSquare !== undefined) {
              await saveBingo(sheet.bingoSquare, f);
              return;
            }
            const path = await upload(f);
            const { error } = await sheet.run(path);
            if (error) throw new Error(error.message);
            const before = myMarks.size;
            await refresh();
            if (before === 8) setBurst((b) => b + 1);
          }}
        />
      )}
      {edit && (
        <DayEditor
          trip={trip}
          day={day}
          onClose={() => setEdit(false)}
          onSaved={async () => {
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function YesterdayWinners({
  trip,
  date,
  nameOf,
}: {
  trip: TripWithRole;
  date: string;
  nameOf: (id: string) => string;
}) {
  const prev = new Date(new Date(`${date}T12:00:00Z`).getTime() - 86400000)
    .toISOString()
    .slice(0, 10);
  const [rows, setRows] = useState<{ kind: string; choice_id: string; votes: number }[]>([]);
  useEffect(() => {
    if (prev < trip.start_date) return;
    void supabase
      .rpc("day_vote_results", { p_trip: trip.id, p_date: prev })
      .then(({ data }) => setRows(data ?? []));
  }, [trip.id, prev]);
  const winners = (k: string) => {
    const r = rows.filter((x) => x.kind === k);
    const max = Math.max(0, ...r.map((x) => x.votes));
    return r.filter((x) => x.votes === max && max > 0).map((x) => nameOf(x.choice_id));
  };
  const mvp = winners("mvp"),
    photo = winners("photo");
  if (!mvp.length && !photo.length) return null;
  return (
    <section className="mt-5 rounded-[1.75rem] p-5 bg-orange text-primary-foreground">
      <p className="text-xs font-extrabold">YESTERDAY'S WINNERS 🏆</p>
      {mvp.length > 0 && (
        <p className="font-display text-xl font-extrabold mt-2">
          🏅 MVP: {mvp.join(" & ")} <span className="text-sm">+5</span>
        </p>
      )}
      {photo.length > 0 && (
        <p className="font-display text-xl font-extrabold mt-1">
          📸 Best photo: {photo.join(" & ")} <span className="text-sm">+3</span>
        </p>
      )}
    </section>
  );
}

function DayEditor({
  trip,
  day,
  onClose,
  onSaved,
}: {
  trip: TripWithRole;
  day: Day;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const prepare = useServerFn(prepareTripDay);
  const [bingo, setBingo] = useState(strs(day.bingo)),
    [quests, setQuests] = useState(strs(day.quests)),
    [theme, setTheme] = useState(day.photo_theme),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState("");
  async function regen(mode: "explorer" | "local") {
    if (!(await askCredits(trip.id, "regen_set"))) return;
    setBusy(true);
    setErr("");
    try {
      await prepare({ data: { tripId: trip.id, date: day.day_date, mode, regenerate: true } });
      await onSaved();
      onClose();
    } catch (e) {
      setErr(creditError(e));
    }
    setBusy(false);
  }
  async function save() {
    setBusy(true);
    setErr("");
    const { error } = await supabase.rpc("edit_trip_day", {
      p_trip: trip.id,
      p_date: day.day_date,
      p_bingo: bingo,
      p_quests: quests,
      p_theme: theme,
    });
    setBusy(false);
    if (error) setErr(friendlyError(error));
    else {
      await onSaved();
      onClose();
    }
  }
  return (
    <Sheet label="Edit today's games" onClose={onClose}>
      <h3 className="font-display text-2xl font-extrabold">Edit today's games ✏️</h3>
      <p className="text-sm font-bold mt-4">Bingo squares</p>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <Button variant="subtle" disabled={busy} onClick={() => regen("explorer")}>
          <RefreshCw /> Explorer
        </Button>
        <Button variant="subtle" disabled={busy} onClick={() => regen("local")}>
          <Sparkles /> Local (AI)
        </Button>
      </div>
      {bingo.map((b, i) => (
        <input
          key={i}
          className={`${field} mt-2`}
          maxLength={120}
          value={b}
          onChange={(e) => setBingo(bingo.map((x, j) => (j === i ? e.target.value : x)))}
          aria-label={`Square ${i + 1}`}
        />
      ))}
      {quests.length > 0 && (
        <>
          <p className="text-sm font-bold mt-5">Quests</p>
          {quests.map((q, i) => (
            <input
              key={i}
              className={`${field} mt-2`}
              maxLength={160}
              value={q}
              onChange={(e) => setQuests(quests.map((x, j) => (j === i ? e.target.value : x)))}
              aria-label={`Quest ${i + 1}`}
            />
          ))}
        </>
      )}
      <label className="block text-sm font-bold mt-5">
        Photo theme
        <input
          className={`${field} mt-2`}
          maxLength={80}
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
        />
      </label>
      {err && (
        <p role="alert" className="text-sm text-destructive mt-3">
          {err}
        </p>
      )}
      <Button variant="playful" className="w-full mt-6 h-14" disabled={busy} onClick={save}>
        {busy ? "Working…" : "Save changes"}
      </Button>
    </Sheet>
  );
}

export function TripSeasonBoard({
  trip,
  members,
  cards,
  userId,
  rows: given,
  compact,
  onMember,
}: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  rows?: SeasonRow[];
  compact?: boolean;
  onMember?: ((id: string) => void) | undefined;
}) {
  const [own, setOwn] = useState<SeasonRow[]>([]);
  useEffect(() => {
    if (given) return;
    const load = () =>
      supabase.rpc("trip_season_score", { p_trip: trip.id }).then(({ data }) => setOwn(data ?? []));
    void load();
    const t = window.setInterval(load, 20000);
    return () => window.clearInterval(t);
  }, [trip.id, !!given]);
  const rows = (given ?? own)
    .map((r) => ({
      ...r,
      score:
        "score" in r
          ? Number(r.score)
          : Math.min(100, r.max_stamps ? Math.round((r.stamps / r.max_stamps) * 100) : 0),
    }))
    .sort((a, b) => b.score - a.score || b.stamps - a.stamps);
  const list = compact ? rows.slice(0, 5) : rows;
  const [allRows, setAllRows] = useState(false);
  useEffect(() => {
    try {
      setAllRows(localStorage.getItem(`board-trip-${trip.id}`) === "true");
    } catch {
      /* storage unavailable */
    }
  }, [trip.id]);
  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl font-extrabold">Trip Season 🧳</h2>
      {list.length === 0 ? (
        <p className="text-sm text-ink-soft mt-2">Everyone starts at 0.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {(list.length > 3 && !allRows ? list.slice(0, 3) : list).map((s, i) => {
            const c = cards.find((x) => x.user_id === s.user_id);
            const name =
              c?.game_name ||
              members.find((m) => m.user_id === s.user_id)?.display_name ||
              "Player";
            return (
              <li
                key={s.user_id}
                role={onMember ? "button" : undefined}
                tabIndex={onMember ? 0 : undefined}
                aria-label={onMember ? "Open player card" : undefined}
                onClick={onMember ? () => onMember(s.user_id) : undefined}
                onKeyDown={
                  onMember
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onMember(s.user_id);
                        }
                      }
                    : undefined
                }
                className={`flex items-center gap-3 rounded-2xl p-3 ${onMember ? "cursor-pointer hover:border-primary" : ""} ${i === 0 && s.stamps > 0 ? "bg-orange-soft" : "bg-card border border-border"} ${s.user_id === userId ? "ring-2 ring-primary" : ""}`}
              >
                <span className="font-display font-extrabold w-6 text-center">{i + 1}</span>
                <span className="relative">
                  {i === 0 && s.stamps > 0 && (
                    <Crown
                      size={20}
                      className="absolute -top-3 left-1/2 -translate-x-1/2 text-orange fill-orange"
                    />
                  )}
                  <Avatar url={c?.avatarUrl} name={name} className="h-11 w-11" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold truncate">{name}</span>
                  <StampBadge tripId={trip.id} userId={s.user_id} />
                  <span className="block text-xs text-ink-soft">
                    🛂 {s.stamps} stamps · {s.today_stamps} today
                  </span>
                </span>
                <span className="passport-stamp bg-card px-2 py-1 font-display font-extrabold text-lg text-blue">
                  {s.score}
                </span>
              </li>
            );
          })}
          {list.length > 3 && (
            <li>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setAllRows(!allRows);
                  safeSetItem(`board-trip-${trip.id}`, String(!allRows));
                }}
              >
                {allRows ? "Show less" : `Show all (${list.length})`}
              </Button>
            </li>
          )}
        </ol>
      )}
      <p className="text-xs text-muted-foreground mt-2">
        Score out of 100 = stamps earned ÷ max possible so far · separate from Pre-Flight
      </p>
    </section>
  );
}

export function TripSeasonPreview({ trip }: { trip: TripWithRole }) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<{ date: string; tag: DayTag }[]>([]);
  useEffect(() => {
    if (!open) return;
    void loadItinerary(trip.id)
      .then(({ days, tags }) =>
        setRows(tripDates(trip).map((d) => ({ date: d, tag: dayTag(d, days, tags) }))),
      )
      .catch(() => setRows(tripDates(trip).map((d) => ({ date: d, tag: "Explore" as DayTag }))));
  }, [open, trip.id]);
  const total = rows.reduce((s, r) => s + DAY_CAP(r.tag), 0);
  return (
    <section className="mb-6 rounded-[1.75rem] bg-orange-soft p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold text-ink-soft">CAPTAIN PREVIEW 👑</p>
          <h2 className="font-display text-xl font-extrabold">Trip Season</h2>
          <p className="text-xs text-ink-soft">What the squad plays once the trip starts.</p>
        </div>
        <Button variant="playful" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Preview"}
        </Button>
      </div>
      {open && (
        <div className="mt-4 space-y-2">
          {rows.map((r) => (
            <div key={r.date} className="bg-card rounded-2xl p-3">
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm">
                  {tagEmoji[r.tag]}{" "}
                  {new Date(`${r.date}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · {r.tag}
                </p>
                <span className="text-xs font-extrabold text-orange">max {DAY_CAP(r.tag)} 🛂</span>
              </div>
              <p className="text-xs text-ink-soft mt-1">{gamesFor(r.tag).join(" · ")}</p>
            </div>
          ))}
          <p className="text-sm font-extrabold">
            Up to {total} stamps across {rows.length} days. Change day types in Itinerary.
          </p>
        </div>
      )}
    </section>
  );
}

export function GameDayTools({
  trip,
  onUpdated,
}: {
  trip: TripWithRole;
  onUpdated: () => Promise<void> | void;
}) {
  const t = trip as TripWithRole & {
    rest_days?: string[];
    game_days_every?: number | null;
    surprise_mode?: boolean;
  };
  const days: string[] = [];
  for (
    let d = new Date(`${trip.start_date}T12:00:00Z`);
    d <= new Date(`${trip.end_date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1)
  )
    days.push(d.toISOString().slice(0, 10));
  const len = days.length;
  const [rest, setRest] = useState<string[]>(t.rest_days ?? []),
    [every, setEvery] = useState<number>(t.game_days_every ?? (len > 10 ? 2 : 1)),
    [surprise, setSurprise] = useState(!!t.surprise_mode),
    [msg, setMsg] = useState("");
  async function save() {
    setMsg("");
    const { error } = await (
      supabase as unknown as {
        rpc: (f: string, x: object) => PromiseLike<{ error: { message: string } | null }>;
      }
    ).rpc("set_game_days", {
      p_trip: trip.id,
      p_every: len > 10 ? every : null,
      p_rest: rest,
      p_surprise: surprise,
    });
    setMsg(error ? friendlyError(error) : "Game days saved ✓");
    if (!error) await onUpdated();
  }
  const rule =
    len <= 4
      ? "Short trip: games every non-travel day."
      : len <= 10
        ? "Games most days. Tap a day to make it a rest day."
        : "Long trip: every other non-travel day by default.";
  return (
    <div className="mt-3">
      <p className="text-sm text-ink-soft">
        {rule} Travel days from your itinerary flights are skipped automatically.
      </p>
      {len > 10 && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          {[1, 2].map((n) => (
            <Button
              key={n}
              size="sm"
              variant={every === n ? "playful" : "outline"}
              onClick={() => setEvery(n)}
            >
              {n === 1 ? "Every day" : "Every other day"}
            </Button>
          ))}
        </div>
      )}
      {len > 4 && (
        <>
          <p className="text-sm font-bold mt-4">Rest days</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {days.map((d) => {
              const on = rest.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setRest(on ? rest.filter((x) => x !== d) : [...rest, d])}
                  className={`rounded-full px-3 py-2 text-xs font-bold border-2 ${on ? "bg-blue-soft border-blue" : "bg-card border-border"}`}
                >
                  {on ? "😴 " : ""}
                  {new Date(`${d}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </button>
              );
            })}
          </div>
        </>
      )}
      <label className="mt-4 flex items-start gap-3 rounded-2xl bg-pink-soft p-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5"
          checked={surprise}
          onChange={(e) => setSurprise(e.target.checked)}
        />
        <span>
          <span className="font-bold block">🎲 Surprise mode</span>
          <span className="text-xs text-ink-soft">
            The app picks game days at random (never travel days) and reveals "Surprise! Today's a
            game day" that morning.
          </span>
        </span>
      </label>
      <Button variant="playful" className="w-full mt-4" onClick={() => void save()}>
        Save game days
      </Button>
      {msg && (
        <p role="status" className="text-sm mt-2">
          {msg}
        </p>
      )}
    </div>
  );
}
