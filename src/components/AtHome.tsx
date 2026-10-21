import { tripDisplayName } from "@/lib/trip-display-name";
import { JunkieRewards } from "./ExperiencePreviews";
import { CountryFlag } from "@/components/CountryFlag";
import { PlacePicker } from "@/components/PlacePicker";
import { countryName, type Place } from "@/lib/places";
import { TripSectionIcon } from "@/components/TripSectionIcon";
import { FeatureGate } from "@/lib/features";
import { TripCostsPlayer } from "./TripCosts";
import { RememberedSection } from "./RememberedSection";
import { friendlyError } from "@/lib/friendly-error";
import { ActivityTimer, SingOff } from "@/components/GameExtrasC2";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Phone, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Checkout, usd } from "@/components/Checkout";
import { CallPanel } from "@/components/CaptainExtras";
import { Avatar } from "@/components/PlayerCards";
import { fmtWhen, viewerZone } from "@/lib/viewer-time";
import type { TripWithRole } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";
import lounge from "@/assets/athome-lounge.jpg";
import thailand from "@/assets/athome-thailand.jpg";
import mexico from "@/assets/athome-mexico.jpg";
import japan from "@/assets/athome-japan.jpg";
import travelFriends from "@/assets/travel-friends-cutout.webp";
import atHomeArt from "@/assets/cinematic-at-home.jpg";
import daylightJapan from "@/assets/cinematic-day-japan.jpg";
import daylightMexico from "@/assets/cinematic-day-mexico.jpg";
import daylightThailand from "@/assets/cinematic-day-thailand.jpg";
const daylightPanels = { japan: daylightJapan, mexico: daylightMexico, thailand: daylightThailand };
import { useLook } from "@/lib/look";
import { CinematicMonthCalendar } from "./CinematicMonthCalendar";
import { RoomPriceNote } from "@/lib/prices";

const db = supabase as unknown as {
  rpc: (f: string, a?: object) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from: (t: string) => any;
};
type T = TripWithRole & {
  kind?: string;
  at_home_pack?: string | null;
  at_home_length?: string | null;
  call_link?: string | null;
  backup_call_link?: string | null;
};
export const isAtHome = (t: TripWithRole | null | undefined) => (t as T | null)?.kind === "at_home";
export const PACKS = [
  { key: "thailand", name: "Thailand", code: "TH", img: thailand },
  { key: "mexico", name: "Mexico", code: "MX", img: mexico },
  { key: "japan", name: "Japan", code: "JP", img: japan },
] as const;
const packOf = (t: TripWithRole) => PACKS.find((p) => p.key === (t as T).at_home_pack) ?? PACKS[0];
const LENGTHS = Array.from({ length: 6 }, (_, i) => ({ key: `d${i + 2}`, label: `${i + 2} days` }));
const VIBES = [
  { key: "family", label: "👨‍👩‍👧 Family" },
  { key: "chill", label: "😎 Chill" },
  { key: "party", label: "🎉 Party (21+)" },
] as const;
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const nice = (s: string) =>
  new Date(`${s}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

/* ---------- Setup: 4 taps → checkout → invite ---------- */
export function AtHomeSetup({
  onClose,
  onDone,
  loadTrip,
}: {
  onClose: () => void;
  onDone: (id: string) => void;
  loadTrip: (id: string) => Promise<TripWithRole | null>;
}) {
  const cinematic = useLook("at-home") === "cinematic";
  const [place, setPlace] = useState<Place>({ country: null, region: null, city: null });
  const [step, setStep] = useState(0),
    [pack, setPack] = useState(""),
    [len, setLen] = useState(""),
    [start, setStart] = useState(""),
    [chosenVibe, setChosenVibe] = useState("chill"),
    [format, setFormat] = useState<"finale" | "two_nights">("finale"),
    [finalePlace, setFinalePlace] = useState(""),
    [busy, setBusy] = useState(false),
    [minors, setMinors] = useState<boolean | null>(null),
    [err, setErr] = useState(""),
    [trip, setTrip] = useState<TripWithRole | null>(null);
  useEffect(() => {
    try {
      const p = sessionStorage.getItem("tj-prefill-pack");
      if (p && PACKS.some((x) => x.key === p)) {
        setPack(p);
        setPlace({
          country: PACKS.find((x) => x.key === p)?.code ?? null,
          region: null,
          city: null,
        });
      }
      sessionStorage.removeItem("tj-prefill-pack");
    } catch {
      /* storage optional */
    }
  }, []);
  const today = new Date();
  today.setHours(12);
  const firstDay = new Date(today);
  firstDay.setDate(firstDay.getDate() + 1);
  async function create(vibe: string) {
    setBusy(true);
    setErr("");
    const r = await db.rpc("create_at_home_a2c", {
      p_pack: pack,
      p_days: Number(len.slice(1)),
      p_start: start,
      p_vibe: vibe,
      p_tz: viewerZone(),
      p_format: format,
      p_place: finalePlace || null,
    });
    setBusy(false);
    if (r.error) {
      setErr(friendlyError(r.error));
      return;
    }
    const id = r.data as string;
    if (minors) {
      const m = await db.rpc("set_trip_minors", { p_trip: id, p_has: true });
      if (m.error) {
        setErr(friendlyError(m.error));
        return;
      }
    }
    // The new-rule creator has already set the bounded preparation window.
    setTrip(await loadTrip(id));
    setStep(5);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Travel From Home"
        className={`relative w-full max-w-lg max-h-[92dvh] overflow-y-auto bg-card rounded-t-[2rem] p-6 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-soft ${cinematic ? "cinematic-at-home" : ""}`}
      >
        <div className="w-12 h-1.5 bg-border rounded-full mx-auto mb-4" />
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-5 right-5"
          aria-label="Close"
          onClick={onClose}
        >
          <X />
        </Button>
        {step > 0 && step < 5 && (
          <Button variant="ghost" className="-ml-3" onClick={() => setStep(step - 1)}>
            <ArrowLeft /> Back
          </Button>
        )}
        {step === 0 && (
          <>
            <div className="cinematic-frame rounded-2xl aspect-[4/3] cinematic-at-home-hero">
              <img
                src={cinematic ? atHomeArt : lounge}
                alt="A traveler relaxing on a couch with a passport"
                width={1400}
                height={1000}
                className="w-full h-full object-cover"
              />
              {cinematic && (
                <div className="cinematic-at-home-copy">
                  <p className="eyebrow">AT HOME · STEP 1 OF 4</p>
                  <h2 className="font-display text-3xl font-extrabold mt-2">Travel From Home</h2>
                  <p>Your couch, any country.</p>
                </div>
              )}
            </div>
            {!cinematic && (
              <>
                <p className="eyebrow text-primary mt-4">AT HOME EXPERIENCE · STEP 1 OF 4</p>
                <h2 className="font-display text-3xl font-extrabold mt-1">Travel from home</h2>
              </>
            )}
            <p className="font-bold mt-3">Where are we going?</p>
            <p className="text-sm text-muted-foreground mt-1">
              Travel together without leaving home. Solo works too.
            </p>
            {cinematic && pack && (
              <div className="cinematic-at-home-banner">
                <img
                  src={(PACKS.find((p) => p.key === pack) ?? PACKS[0]).img}
                  className="cinematic-daylight-place"
                  alt=""
                  width={1024}
                  height={640}
                  sizes="(max-width: 520px) calc(100vw - 32px), 512px"
                />
                <div>
                  <small>✈ YOUR DESTINATION</small>
                  <p>📍 {(PACKS.find((p) => p.key === pack) ?? PACKS[0]).name.toUpperCase()}</p>
                  <strong>{(PACKS.find((p) => p.key === pack) ?? PACKS[0]).name} at Home</strong>
                  <span>Culture · Food · Games · Experiences</span>
                </div>
              </div>
            )}
            <PlacePicker
              value={place}
              onChange={(p) => {
                setPlace(p);
                const matched = PACKS.find((x) => x.code === p.country);
                setPack(matched?.key ?? "");
              }}
              items={PACKS.map((p) => ({ country: p.code, region: null, city: null }))}
            />
            {place.country && !pack && (
              <p className="mt-2 text-sm text-muted-foreground">
                {countryName(place.country)} is not an available At Home experience yet. Choose
                Thailand, Mexico or Japan.
              </p>
            )}
            {!cinematic && (
              <div className="grid gap-3 mt-4">
                {PACKS.map((p) => (
                  <Button
                    key={p.key}
                    variant="ghost"
                    onClick={() => {
                      setPack(p.key);
                      setPlace({ country: p.code, region: null, city: null });
                      if (!cinematic) setStep(1);
                    }}
                    className={`cinematic-frame relative h-24 rounded-2 border-2 text-left active:scale-[.98] transition ${cinematic && pack === p.key ? "cinematic-selected-place" : "border-border"}`}
                  >
                    <img
                      src={cinematic ? daylightPanels[p.key as keyof typeof daylightPanels] : p.img}
                      alt=""
                      width={cinematic ? 512 : 1024}
                      height={cinematic ? 512 : 640}
                      loading="lazy"
                      className={`absolute inset-0 h-full w-full object-cover ${cinematic ? "cinematic-daylight-place" : ""}`}
                    />
                    <span className="absolute inset-0 bg-gradient-to-r from-background/90 to-transparent" />
                    <span className="relative px-4 font-display text-2xl font-extrabold">
                      {p.name}
                    </span>
                    <span className="cinematic-caption absolute bottom-2 right-3 z-10">
                      {p.name.toUpperCase()} · AT HOME
                    </span>
                  </Button>
                ))}
              </div>
            )}
            {cinematic && (
              <div className="cinematic-at-home-ticket">
                <Button
                  variant="playful"
                  disabled={!pack}
                  className="w-full"
                  onClick={() => setStep(1)}
                >
                  ✈ Now boarding for {PACKS.find((p) => p.key === pack)?.name ?? "your destination"}{" "}
                  <ArrowRight />
                </Button>
              </div>
            )}
            <PriceNote />
          </>
        )}
        {step === 1 && (
          <>
            <p className="eyebrow text-primary">STEP 2 OF 4</p>
            <h2 className="font-display text-3xl font-extrabold mt-1">How long?</h2>
            <div className="grid grid-cols-3 gap-2 mt-4">
              {LENGTHS.map((l) => (
                <Button
                  key={l.key}
                  variant="subtle"
                  className="min-h-14"
                  onClick={() => {
                    setLen(l.key);
                    setStart("");
                    setFormat("finale");
                    setStep(2);
                  }}
                >
                  {l.label}
                </Button>
              ))}
            </div>
            <PriceNote />
          </>
        )}
        {step === 2 && (
          <>
            <p className="eyebrow text-primary">STEP 3 OF 4</p>
            <h2 className="font-display text-3xl font-extrabold mt-1">When do we take off?</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Choose a day at least one day from now. Each day has its own scheduled Game Day.
            </p>
            <input
              type="date"
              min={iso(firstDay)}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              aria-label="Start date"
              className="w-full mt-4 h-12 rounded-xl bg-card border-2 border-border px-3"
            />
            <Button
              variant="playful"
              className="w-full mt-3"
              disabled={!start || start < iso(firstDay)}
              onClick={() => setStep(3)}
            >
              Next <ArrowRight />
            </Button>
          </>
        )}
        {step === 3 && (
          <>
            <p className="eyebrow text-primary">STEP 4 OF 4</p>
            <h2 className="font-display text-3xl font-extrabold mt-1">Pick the vibe</h2>
            <p className="font-bold mt-4">Is anyone under 18 joining?</p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Button
                className="min-h-11"
                variant={minors === true ? "playful" : "outline"}
                onClick={() => setMinors(true)}
              >
                Yes
              </Button>
              <Button
                className="min-h-11"
                variant={minors === false ? "playful" : "outline"}
                onClick={() => setMinors(false)}
              >
                No
              </Button>
            </div>
            {minors !== null && (
              <div className="grid gap-3 mt-4">
                {VIBES.filter((v) => !minors || v.key === "family").map((v) => (
                  <Button
                    key={v.key}
                    variant="subtle"
                    className="h-14"
                    disabled={busy}
                    onClick={() => {
                      setChosenVibe(v.key);
                      setStep(4);
                    }}
                  >
                    {v.label}
                  </Button>
                ))}
              </div>
            )}
            {minors && (
              <p className="text-xs text-muted-foreground mt-2">
                Family content only for this experience.
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              Everything else is pre-made. Times show in everyone's own time zone.
            </p>
          </>
        )}
        {step === 4 && (
          <div className="min-h-[60dvh] flex flex-col justify-center">
            <h2 className="font-display text-3xl font-extrabold mt-4">Your finale</h2>
            <p className="text-sm mt-2">
              Just the finale is an in-person game night on the last day. Two game nights adds a
              video call halfway through.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-5">
              <Button
                variant={format === "finale" ? "playful" : "outline"}
                onClick={() => setFormat("finale")}
              >
                Just the finale
              </Button>
              <Button
                variant={format === "two_nights" ? "playful" : "outline"}
                disabled={Number(len.slice(1)) < 4}
                onClick={() => setFormat("two_nights")}
              >
                Two game nights
              </Button>
            </div>
            <label className="mt-4 font-bold">
              Finale place
              <input
                className="w-full mt-2 h-12 rounded border border-border bg-card px-3"
                value={finalePlace}
                onChange={(e) => setFinalePlace(e.target.value)}
                placeholder="Where will your squad meet?"
              />
            </label>
            <Button
              variant="playful"
              className="w-full mt-5 min-h-11"
              disabled={busy || finalePlace.trim().length < 2}
              onClick={() => void create(chosenVibe)}
            >
              Take flight <ArrowRight />
            </Button>
          </div>
        )}
        {step === 5 && trip && (
          <>
            <p className="eyebrow text-primary">CHECKOUT</p>
            <h2 className="font-display text-3xl font-extrabold mt-1">Your boarding pass 🎫</h2>
            <Checkout trip={trip} compact onDone={() => onDone(trip.id)} />
          </>
        )}
        {err && (
          <p role="alert" className="text-sm text-destructive mt-3">
            {err}
          </p>
        )}
      </section>
    </div>
  );
}
// New At Home rooms are created with the new rule, so they use the culture price from the server price list.
function PriceNote() {
  return <RoomPriceNote room="culture" />;
}

/* ---------- Home ---------- */
type Act = {
  id: string;
  day_date: string;
  kind: string;
  released: boolean;
  title: string | null;
  body: string | null;
  want: string | null;
  extra_title: string | null;
  extra_body: string | null;
  starts_at: string | null;
  game_name: string | null;
  game_how: string | null;
  winner_id: string | null;
  revealed: boolean;
  answers: number;
  answered: boolean;
  voted: boolean;
  today: string;
};
function usePlan(tripId: string) {
  const [plan, setPlan] = useState<Act[] | null>(null),
    [err, setErr] = useState("");
  const load = () =>
    db.rpc("at_home_plan", { p_trip: tripId }).then((r) => {
      if (r.error) setErr(friendlyError(r.error));
      else setPlan((r.data as Act[]) ?? []);
    });
  useEffect(() => {
    void load();
  }, [tripId]);
  return { plan, err, reload: load };
}
const KIND: Record<string, { e: string; label: string }> = {
  takeoff: { e: "🛫", label: "Takeoff" },
  call_night: { e: "📞", label: "Call game night" },
  cook: { e: "🍳", label: "Cook-off / order-in" },
  build: { e: "✂️", label: "Make it challenge" },
  drop: { e: "💌", label: "Little drop" },
  question: { e: "❓", label: "Question vote" },
  passport: { e: "🛂", label: "Passport Night" },
};

export function AtHomeHome({ trip, open }: { trip: TripWithRole; open: (v: string) => void }) {
  const p = packOf(trip);
  const { plan } = usePlan(trip.id);
  const today = plan?.[0]?.today;
  const next = plan?.find((a) => today && a.day_date >= today);
  const days = Math.ceil(
    (new Date(`${trip.start_date}T00:00:00`).getTime() - Date.now()) / 86400000,
  );
  return (
    <div className="home-room-scene home-room-overview">
      <div className="relative mb-16">
        <div className="cinematic-frame rounded-[24px] border border-border">
          <img
            src={p.img}
            alt={`${p.name} skyline postcard`}
            width={1024}
            height={640}
            className="w-full aspect-[16/10] object-cover"
          />
          <span className="passport-stamp absolute right-3 top-3 bg-card text-primary px-3 py-1 text-xs font-extrabold">
            <CountryFlag code={p.code} /> AT HOME
          </span>
          <span className="cinematic-caption absolute bottom-3 left-4 z-10">
            {p.name.toUpperCase()} · AT HOME
          </span>
        </div>
        <img
          src={travelFriends}
          alt=""
          aria-hidden="true"
          className="absolute -bottom-16 right-1 w-52 max-w-[55%] drop-shadow-lg"
        />
      </div>
      <div className="app-card mt-3">
        <h1 className="flex min-w-0 items-center gap-1 font-display text-xl font-extrabold">
          <TripSectionIcon trip={trip} />
          <span className="min-w-0 break-words">{tripDisplayName(trip.name)}</span>
        </h1>
        <p className="eyebrow mt-2">
          {p.name} · {friendlyLen(trip)}
        </p>
        <p className="font-display text-[48px] leading-none font-extrabold text-primary mt-3">
          {days > 0 ? days : "✈️"}
        </p>
        <p className="text-xs text-muted-foreground">
          {days > 0
            ? `days until takeoff · ${nice(trip.start_date)}`
            : days > -30 && !trip.ended_at
              ? "You're traveling — check Play for today"
              : "Trip complete"}
        </p>
      </div>
      {next && (
        <div className="app-card mt-3">
          <p className="eyebrow text-blue">UP NEXT · {nice(next.day_date)}</p>
          <p className="font-display text-lg font-extrabold mt-1">
            {KIND[next.kind]?.e} {KIND[next.kind]?.label}
          </p>
          {next.starts_at && (
            <p className="text-sm text-muted-foreground">{fmtWhen(next.starts_at, "")}</p>
          )}
          {next.want && (
            <p className="text-sm mt-2">
              🛍️ <strong>You might want:</strong> {next.want}
            </p>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <Button variant="outline" className="h-12" onClick={() => open("Invite")}>
          Invite squad
        </Button>
        <Button variant="outline" className="h-12" onClick={() => open("Quick actions")}>
          More
        </Button>
      </div>
    </div>
  );
}
const friendlyLen = (t: TripWithRole) =>
  LENGTHS.find((l) => l.key === (t as T).at_home_length)?.label ??
  { weekend: "3 days", week: "7 days", two_weeks: "14 days" }[(t as T).at_home_length ?? ""] ??
  "";

/* ---------- Play ---------- */
export function AtHomePlay({
  trip,
  cards,
  userId,
  viewOnly,
  refresh,
}: {
  trip: TripWithRole;
  cards: PlayerWithAvatar[];
  userId: string;
  viewOnly?: boolean;
  refresh: () => Promise<void>;
}) {
  const { plan, err, reload } = usePlan(trip.id);
  const [call, setCall] = useState(false),
    [msg, setMsg] = useState("");
  const [songWinners, setSongWinners] = useState<Record<string, string>>({});
  const [nightHost, setNightHost] = useState(false);
  const songActivity = plan?.find(
    (a) =>
      a.released &&
      a.day_date === a.today &&
      ["call_night", "cook", "build", "passport"].includes(a.kind),
  );
  useEffect(() => {
    let live = true;
    const load = async () => {
      const ids = (plan ?? []).filter((a) => a.released).map((a) => a.id);
      const [wins, hosts] = await Promise.all([
        ids.length
          ? db.from("at_home_song_winners").select("activity_id,user_id").in("activity_id", ids)
          : Promise.resolve({ data: [] }),
        db
          .from("game_nights")
          .select("starts_at,host_id")
          .eq("trip_id", trip.id)
          .eq("host_id", userId),
      ]);
      if (live) {
        setSongWinners(
          Object.fromEntries(
            (wins.data ?? []).map((w: { activity_id: string; user_id: string }) => [
              w.activity_id,
              w.user_id,
            ]),
          ),
        );
        setNightHost(
          (hosts.data ?? []).some(
            (n: { starts_at: string }) => n.starts_at.slice(0, 10) === songActivity?.day_date,
          ),
        );
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [trip.id, userId, plan]);
  const tx = trip as T;
  const leader = !viewOnly && ["captain", "co_captain"].includes(trip.myRole);
  const captain = !viewOnly && trip.myRole === "captain";
  const solo = cards.length <= 1;
  const nameOf = (id: string | null) => cards.find((c) => c.user_id === id)?.game_name ?? "Player";
  const act = async (f: string, a: object) => {
    setMsg("");
    const r = await db.rpc(f, a);
    if (r.error) setMsg(friendlyError(r.error));
    await reload();
  };
  if (err)
    return (
      <p role="alert" className="text-sm text-destructive">
        {err}
      </p>
    );
  if (!plan) return <div className="h-48 rounded-2xl bg-muted animate-pulse" aria-busy="true" />;
  const today = plan[0]?.today ?? "";
  const lastDay = trip.end_date <= today;
  return (
    <div className="home-room-scene home-room-play">
      <p className="eyebrow text-primary">{packOf(trip).name.toUpperCase()} AT HOME</p>
      <h1 className="font-display text-[28px] font-extrabold mt-1">
        Your destination · {packOf(trip).name}
      </h1>
      <p className="font-bold text-blue mt-1">Now boarding for {packOf(trip).name} ✈️</p>
      <p className="text-sm text-muted-foreground">
        Light weekdays, bigger weekends. New drops unlock each morning in your time zone.
      </p>
      <>
        <FeatureGate tripId={trip.id} feature="host_timer">
          <ActivityTimer tripId={trip.id} canRun={leader} />
        </FeatureGate>
        {!solo && (
          <FeatureGate tripId={trip.id} feature="sing_off">
            <SingOff
              tripId={trip.id}
              userId={userId}
              names={Object.fromEntries(cards.map((c) => [c.user_id, c.game_name ?? "Player"]))}
              canRun={!!songActivity && (leader || (!viewOnly && nightHost))}
              winnerId={songActivity ? songWinners[songActivity.id] : undefined}
              onPick={
                songActivity
                  ? async (id) => {
                      const r = await db.rpc("pick_at_home_song", {
                        p_activity: songActivity.id,
                        p_user: id,
                      });
                      if (r.error) throw new Error(r.error.message);
                      setSongWinners((current) => ({ ...current, [songActivity.id]: id }));
                    }
                  : undefined
              }
            />
          </FeatureGate>
        )}
      </>
      {Object.entries(songWinners).map(([activityId, winner]) => (
        <p key={activityId} className="text-sm font-bold text-green mt-2">
          💿 Sing-off winner: {nameOf(winner)}
        </p>
      ))}
      {tx.call_link ? (
        <Button variant="playful" className="w-full mt-4" onClick={() => setCall(true)}>
          <Phone /> Join call
        </Button>
      ) : (
        captain && (
          <p className="text-xs text-muted-foreground mt-3">
            Add a call link in Captain Tools so everyone can hop on calls.
          </p>
        )
      )}
      {call && tx.call_link && (
        <CallPanel
          link={tx.call_link}
          backup={tx.backup_call_link}
          onClose={() => setCall(false)}
        />
      )}
      {msg && (
        <p role="status" className="text-sm text-destructive mt-3">
          {msg}
        </p>
      )}
      <div className="mt-4 space-y-3">
        {plan.map((a) => (
          <ActivityCard
            key={a.id}
            a={a}
            trip={trip}
            cards={cards}
            userId={userId}
            leader={leader}
            captain={captain}
            solo={solo}
            nameOf={nameOf}
            act={act}
          />
        ))}
      </div>
      {lastDay && <Mvp trip={trip} nameOf={nameOf} solo={solo} />}
      {captain && lastDay && !trip.ended_at && (
        <Button
          variant="outline"
          className="w-full mt-4"
          onClick={async () => {
            const r = await db.rpc("end_trip", { p_trip: trip.id });
            if (r.error) setMsg(friendlyError(r.error));
            else {
              setMsg("");
              await refresh();
            }
          }}
        >
          🛬 Land the trip (everyone gets a postcard)
        </Button>
      )}
      {trip.ended_at && (
        <p className="mt-4 rounded-2xl bg-green-soft p-4 text-sm font-bold">
          📮 Landed! Your {packOf(trip).name} postcard is in Me › Rewards.
        </p>
      )}
    </div>
  );
}

function ActivityCard({
  a,
  trip,
  cards,
  userId,
  leader,
  captain,
  solo,
  nameOf,
  act,
}: {
  a: Act;
  trip: TripWithRole;
  cards: PlayerWithAvatar[];
  userId: string;
  leader: boolean;
  captain: boolean;
  solo: boolean;
  nameOf: (id: string | null) => string;
  act: (f: string, a: object) => Promise<void>;
}) {
  const k = KIND[a.kind] ?? { e: "✨", label: a.kind };
  const [moving, setMoving] = useState(false),
    [when, setWhen] = useState("");
  return (
    <section className={`app-card ${a.released ? "" : "opacity-70"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="eyebrow text-blue">
            {nice(a.day_date)}
            {a.day_date === a.today ? " · TODAY" : ""}
          </p>
          <h2 className="font-display text-lg font-extrabold mt-1">
            {k.e} {k.label}
          </h2>
        </div>
        {a.starts_at && (
          <span className="text-xs text-right text-muted-foreground max-w-40">
            {fmtWhen(a.starts_at, "")}
          </span>
        )}
      </div>
      {!a.released ? (
        <p className="text-sm text-muted-foreground mt-2">
          🔒 Unlocks the morning of {nice(a.day_date)}.
        </p>
      ) : (
        <>
          {a.kind === "takeoff" && <BoardingPasses trip={trip} cards={cards} />}
          {a.title && <p className="font-bold mt-2">{a.title}</p>}
          {a.body && <p className="text-sm text-ink-soft mt-1">{a.body}</p>}
          {a.extra_title && (
            <p className="text-sm mt-2">
              <strong>{a.extra_title}:</strong> {a.extra_body}
            </p>
          )}
          {a.game_name && (
            <p className="text-sm mt-2">
              🎲 <strong>Tonight's game: {a.game_name}</strong>
              {a.game_how ? ` — ${a.game_how}` : ""}
            </p>
          )}
          {a.kind === "call_night" && (
            <p className="text-xs text-muted-foreground mt-1">
              30–45 min on your call link. Draw cards from the Game Day deck if you want more.
            </p>
          )}
          {a.kind === "question" && (
            <Question a={a} userId={userId} leader={leader} solo={solo} nameOf={nameOf} act={act} />
          )}
          {["call_night", "cook", "build"].includes(a.kind) && !solo && (
            <div className="mt-3">
              {a.winner_id ? (
                <p className="text-sm font-bold text-green">
                  <Trophy className="inline size-4" /> Winner: {nameOf(a.winner_id)}
                </p>
              ) : (
                leader && (
                  <details>
                    <summary className="cursor-pointer text-sm font-bold text-primary">
                      Mark winner
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {cards.map((c) => (
                        <Button
                          key={c.user_id}
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void act("at_home_mark_winner", { p_activity: a.id, p_user: c.user_id })
                          }
                        >
                          <Avatar url={c.avatarUrl} name={c.game_name} className="h-5 w-5" />
                          {c.game_name}
                        </Button>
                      ))}
                    </div>
                  </details>
                )
              )}
            </div>
          )}
        </>
      )}
      {a.want && (
        <p className="text-sm mt-2">
          🛍️ <strong>You might want:</strong> {a.want}{" "}
          <span className="text-muted-foreground">(optional)</span>
        </p>
      )}
      {captain &&
        a.starts_at &&
        !a.released &&
        (moving ? (
          <div className="mt-2 flex gap-2">
            <input
              type="datetime-local"
              aria-label="New call time"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="flex-1 h-10 rounded-xl bg-card border-2 border-border px-2 text-sm"
            />
            <Button
              size="sm"
              disabled={!when}
              onClick={() => {
                void act("at_home_move_call", {
                  p_activity: a.id,
                  p_at: new Date(when).toISOString(),
                });
                setMoving(false);
              }}
            >
              Save
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="mt-1 px-0 text-primary"
            onClick={() => setMoving(true)}
          >
            Change date/time
          </Button>
        ))}
    </section>
  );
}

function BoardingPasses({ trip, cards }: { trip: TripWithRole; cards: PlayerWithAvatar[] }) {
  const p = packOf(trip);
  return (
    <div className="mt-3 flex gap-3 overflow-x-auto pb-2 snap-x">
      {cards.map((c, i) => (
        <div
          key={c.user_id}
          className="snap-start shrink-0 w-56 rounded-2xl border-2 border-dashed border-primary bg-pink-soft p-3 card-draw-reveal"
        >
          <p className="text-[10px] font-extrabold tracking-widest text-primary">
            BOARDING PASS · TJ{100 + i}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Avatar url={c.avatarUrl} name={c.game_name} className="h-9 w-9" />
            <p className="font-display font-extrabold truncate">{c.game_name}</p>
          </div>
          <div className="mt-2 flex justify-between text-xs">
            <span>AT HOME</span>
            <span>✈️</span>
            <span>{p.name.toUpperCase()}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Seat {String.fromCharCode(65 + (i % 6))}
            {i + 1} · Gate: your couch
          </p>
        </div>
      ))}
    </div>
  );
}

type Ans = {
  idx: number;
  answer: string;
  mine: boolean;
  user_id: string | null;
  votes: number | null;
  my_vote: boolean;
};
function Question({
  a,
  userId,
  leader,
  solo,
  nameOf,
  act,
}: {
  a: Act;
  userId: string;
  leader: boolean;
  solo: boolean;
  nameOf: (id: string | null) => string;
  act: (f: string, a: object) => Promise<void>;
}) {
  const [text, setText] = useState(""),
    [ans, setAns] = useState<Ans[]>([]);
  const load = () =>
    db.rpc("at_home_question", { p_activity: a.id }).then((r) => setAns((r.data as Ans[]) ?? []));
  useEffect(() => {
    void load();
  }, [a.id, a.answers, a.revealed, a.voted]);
  void userId;
  if (!a.answered && !a.revealed)
    return (
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void act("at_home_answer", { p_activity: a.id, p_answer: text });
        }}
      >
        <input
          value={text}
          maxLength={280}
          onChange={(e) => setText(e.target.value)}
          placeholder="Your answer"
          aria-label="Your answer"
          className="flex-1 h-11 rounded-xl bg-card border-2 border-border px-3"
        />
        <Button type="submit" disabled={!text.trim()}>
          Send
        </Button>
      </form>
    );
  if (solo) return <p className="text-sm text-green font-bold mt-2">✓ Answered — nice one.</p>;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-muted-foreground">
        {a.revealed
          ? "Results"
          : `${a.answers} answer${a.answers === 1 ? "" : "s"} in · tap one you love (not your own). Votes stay hidden until reveal.`}
      </p>
      {ans.map((x) => (
        <button
          key={x.idx}
          type="button"
          disabled={a.revealed || x.mine}
          onClick={() => void act("at_home_vote", { p_activity: a.id, p_idx: x.idx }).then(load)}
          className={`w-full text-left rounded-xl border-2 p-3 text-sm ${x.my_vote ? "border-primary bg-pink-soft" : "border-border"} ${x.mine ? "opacity-70" : ""}`}
        >
          {x.answer}
          {x.mine && <span className="text-xs text-muted-foreground"> · yours</span>}
          {a.revealed && (
            <span className="block text-xs font-bold mt-1">
              {nameOf(x.user_id)} · {x.votes} vote{x.votes === 1 ? "" : "s"}
            </span>
          )}
        </button>
      ))}
      {leader && !a.revealed && (
        <Button
          variant="playful"
          className="w-full"
          onClick={() => void act("at_home_reveal", { p_activity: a.id })}
        >
          Reveal
        </Button>
      )}
    </div>
  );
}

function Mvp({
  trip,
  nameOf,
  solo,
}: {
  trip: TripWithRole;
  nameOf: (id: string | null) => string;
  solo: boolean;
}) {
  const [rows, setRows] = useState<
    { user_id: string; points: number; wins: number; votes: number }[]
  >([]);
  useEffect(() => {
    void db
      .rpc("at_home_mvp", { p_trip: trip.id })
      .then((r) => setRows((r.data as typeof rows) ?? []));
  }, [trip.id]);
  if (solo || !rows.length || !rows[0]!.points) return null;
  const top = rows[0]!;
  return (
    <section className="app-card mt-4 text-center crown-drop" aria-label="MVP of the trip">
      <p className="eyebrow text-orange">PASSPORT NIGHT</p>
      <p className="text-4xl mt-2">🏅</p>
      <h2 className="font-display text-2xl font-extrabold">
        MVP of the trip: {nameOf(top.user_id)}
      </h2>
      <p className="text-sm text-muted-foreground mt-1">
        {top.wins} win{top.wins === 1 ? "" : "s"} · {top.votes} vote{top.votes === 1 ? "" : "s"} ·
        just for fun, never saved to seasons
      </p>
    </section>
  );
}

/* ---------- Trip tab ---------- */
export function AtHomeTrip({
  trip,
  members = [],
  cards = [],
  userId = "",
  viewOnly = false,
}: {
  trip: TripWithRole;
  members?: import("@/lib/trips").Member[];
  cards?: PlayerWithAvatar[];
  userId?: string;
  viewOnly?: boolean;
}) {
  const cinematic = useLook("journey") === "cinematic";
  const p = packOf(trip);
  const [overview, setOverview] = useState("");
  useEffect(() => {
    void db
      .from("at_home_packs")
      .select("overview")
      .eq("key", p.key)
      .maybeSingle()
      .then((r: { data: { overview: string } | null }) => setOverview(r.data?.overview ?? ""));
  }, [p.key]);
  return (
    <div className="home-room-scene home-room-trip">
      <div className="relative overflow-hidden rounded-[24px] border-4 border-card shadow-soft rotate-[-1deg]">
        <img
          src={p.img}
          alt={`${p.name} postcard`}
          width={1024}
          height={640}
          loading="lazy"
          className="w-full aspect-[16/10] object-cover"
        />
        <span className="absolute left-3 bottom-3 font-display text-2xl font-extrabold drop-shadow">
          Greetings from {p.name} <CountryFlag code={p.code} />
        </span>
      </div>
      <div className="app-card mt-4">
        <p className="eyebrow text-primary">ABOUT THE DESTINATION</p>
        <p className="mt-2 leading-relaxed">{overview}</p>
        <p className="text-sm text-muted-foreground mt-3">
          {nice(trip.start_date)} → {nice(trip.end_date)} · {friendlyLen(trip)} · no flights, no
          packing.
        </p>
      </div>
      {cinematic && (
        <section className="cinematic-trip-section mt-5 p-3">
          <h2 className="font-display text-xl font-extrabold">Game Day Calendar</h2>
          <CinematicMonthCalendar
            trip={trip}
            nights={[]}
            members={members}
            cards={cards}
            userId={userId}
            viewOnly={viewOnly}
          />
        </section>
      )}
      <RememberedSection id={`${trip.id}-home-costs`} title="Trip pot 💸">
        <FeatureGate tripId={trip.id} feature="trip_pot" compact>
          <TripCostsPlayer trip={trip} userId={userId} />
        </FeatureGate>
      </RememberedSection>
    </div>
  );
}

/* ---------- Me › Rewards ---------- */
export function Rewards({ userId }: { userId: string }) {
  const [codes, setCodes] = useState<
      { code: string; cents: number; expires_at: string; used_at: string | null }[]
    >([]),
    [cards, setCards] = useState<{ pack: string; created_at: string }[]>([]),
    [orders, setOrders] = useState<
      {
        id: string;
        label: string;
        amount_due_cents: number;
        discount_cents: number;
        created_at: string;
        kind: string;
      }[]
    >([]);
  useEffect(() => {
    void db
      .from("reward_codes")
      .select("code,cents,expires_at,used_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then((r: { data: typeof codes | null }) => setCodes(r.data ?? []));
    void db
      .from("postcard_stickers")
      .select("pack,created_at")
      .eq("user_id", userId)
      .then((r: { data: typeof cards | null }) => setCards(r.data ?? []));
    void db
      .from("orders")
      .select("id,label,amount_due_cents,discount_cents,created_at,kind")
      .eq("captain_id", userId)
      .order("created_at", { ascending: false })
      .then((r: { data: typeof orders | null }) => setOrders(r.data ?? []));
  }, [userId]);
  const live = codes.find((c) => !c.used_at && Date.parse(c.expires_at) > Date.now());
  return (
    <div className="mt-3 space-y-3">
      <JunkieRewards />
      <div className="rounded-2xl bg-orange-soft p-4">
        {live ? (
          <>
            <p className="eyebrow text-orange">CAPTAIN REWARD</p>
            <p className="font-display text-2xl font-extrabold mt-1">
              {usd(live.cents)} off · {live.code}
            </p>
            <p className="text-xs text-ink-soft mt-1">
              Applies automatically at your next checkout after Founding Member access · expires{" "}
              {new Date(live.expires_at).toLocaleDateString()}
            </p>
          </>
        ) : (
          <p className="text-sm">
            Finish a trip as Captain to earn a {usd(200)} reward code. Every At Home experience
            after your first is {usd(100)} off after Founding Member access.
          </p>
        )}
      </div>
      <div>
        <p className="text-sm font-bold">Postcards</p>
        {cards.length ? (
          <div className="mt-2 flex gap-2 flex-wrap">
            {cards.map((c, i) => {
              const p = PACKS.find((x) => x.key === c.pack);
              return (
                <span key={i} className="passport-stamp bg-card px-3 py-2 text-sm font-extrabold">
                  {p && <CountryFlag code={p.code} />} {p?.name}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">
            Land an At Home experience to collect one.
          </p>
        )}
      </div>
      {orders.length > 0 && (
        <div>
          <p className="text-sm font-bold">Receipts</p>
          <div className="mt-2 space-y-1">
            {orders.map((o) => (
              <p key={o.id} className="text-xs flex justify-between gap-2">
                <span className="truncate">{o.label}</span>
                <span>{usd(o.amount_due_cents)} · $0 beta</span>
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
