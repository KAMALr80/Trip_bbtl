import { ROOM_COPY } from "@/lib/room-copy";
import { useLook } from "@/lib/look";
import { PlacePicker } from "@/components/PlacePicker";
import { countryName, COUNTRIES, type Place } from "@/lib/places";
import { tripDisplayName } from "@/lib/trip-display-name";
import { VibePicker, type Vibe } from "@/components/BetaAccess";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Clipboard, Crown, Share2, Sparkles, Ticket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { suggestTripNames } from "@/lib/trip-names.functions";
import { MottoField } from "./MottoField";
import { Motto } from "./GameNightExtras";
import { InviteCode } from "./InviteCode";
import { GamePlanPicker } from "./GamePlanPicker";
import { inviteUrl, shareInvite, type TripWithRole } from "@/lib/trips";
import { tripToday } from "@/lib/itinerary";
import { PlayingChoice } from "./PlayingChoice";
import { saveOfflineRoster, type PlayArrangement } from "@/lib/play-arrangement";
import { gameNameProblem, normalizeName } from "@/lib/game-name";

type Props = {
  mode: "create" | "join" | "celebrate";
  initialCode?: string;
  trip?: TripWithRole | null;
  onClose: () => void;
  onDone: (id: string) => void;
};
const field =
  "w-full h-14 rounded-2xl border-2 border-border bg-background px-4 outline-none focus:border-primary text-foreground";
export function TripSheets({ mode, initialCode = "", trip, onClose, onDone }: Props) {
  const cinematic = useLook("home-top") === "cinematic";
  const [name, setName] = useState("");
  const [createStep, setCreateStep] = useState<"dates" | "who" | "details">("dates");
  const [playMode, setPlayMode] = useState<PlayArrangement | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [roster, setRoster] = useState<string[]>(["", ""]);
  const [destination, setDestination] = useState("");
  const [place, setPlace] = useState<Place>({ country: null, region: null, city: null });
  const [stops, setStops] = useState<string[]>([]);
  const updatePlace = (p: Place) => {
    const nextStops = p.country === place.country ? stops : [];
    if (nextStops !== stops) setStops([]);
    setPlace(p);
    const cities = [...nextStops, p.city || p.region].filter(Boolean);
    setDestination(
      p.country ? `${cities.join(" + ")}${cities.length ? ", " : ""}${countryName(p.country)}` : "",
    );
  };
  useEffect(() => {
    if (mode !== "create") return;
    try {
      const d = sessionStorage.getItem("tj-prefill-destination");
      if (d) {
        setDestination(d);
        const name = d.split(", ").at(-1);
        const country = COUNTRIES.find((c) => c.name === name)?.code;
        if (country) {
          const cities = d
            .slice(0, -(name!.length + 2))
            .split(" + ")
            .filter(Boolean);
          setStops(cities.slice(0, -1));
          setPlace({ country, region: null, city: cities.at(-1) ?? null });
        }
        sessionStorage.removeItem("tj-prefill-destination");
      }
    } catch {
      /* storage optional */
    }
  }, [mode]);
  const [tripType, setTripType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [zone, setZone] = useState(() =>
    typeof Intl === "undefined" ? "UTC" : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [code, setCode] = useState(initialCode);
  const [motto, setMotto] = useState("");
  const [vibe, setVibe] = useState<Vibe>("chill");
  const [minors, setMinors] = useState<boolean | null>(null);
  const [joined, setJoined] = useState<{ id: string; name: string; destination: string } | null>(
    null,
  );
  const [preview, setPreview] = useState<{
    name: string;
    destination: string;
    motto: string | null;
  } | null>(null);
  useEffect(() => {
    if (mode !== "join" || (code.length !== 6 && code.length !== 8)) {
      setPreview(null);
      return;
    }
    let alive = true;
    void supabase
      .rpc("trip_invite_preview" as never, { p_code: code } as never)
      .then(({ data }: { data: unknown }) => {
        if (alive)
          setPreview(
            ((data as { name: string; destination: string; motto: string | null }[] | null) ??
              [])[0] ?? null,
          );
      });
    return () => {
      alive = false;
    };
  }, [code, mode]);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [phase, setPhase] = useState<"plan" | "invite">("plan");
  const today = tripToday(zone);
  const startDefault = (() => {
    const d = new Date(`${startDate || today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 10);
    return d.toISOString().slice(0, 10) > today ? d.toISOString().slice(0, 10) : today;
  })();
  const [flightStart, setFlightStart] = useState("");
  const [flightDay, setFlightDay] = useState(() => new Date().getDay());
  const [flightTime, setFlightTime] = useState("18:00");
  const [flightCount, setFlightCount] = useState(0);
  const [createdId, setCreatedId] = useState<string | null>(null);
  useEffect(() => {
    if (!createdId || !startDate) return;
    const gap = Math.round(
      (Date.parse(`${startDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000,
    );
    const span = Math.round(
      (Date.parse(`${startDate}T12:00:00Z`) - Date.parse(`${flightStart || today}T12:00:00Z`)) /
        86400000,
    );
    setFlightCount(gap <= 0 ? 0 : gap === 1 ? 1 : span >= 8 ? 2 : 1);
  }, [createdId, startDate, flightStart, today]);
  useEffect(() => {
    setCode(initialCode);
  }, [initialCode]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [onClose]);
  async function getSuggestions() {
    if (suggesting) return;
    if (!destination.trim()) {
      setError("Add a destination to get name ideas.");
      return;
    }
    setError("");
    setSuggesting(true);
    setSuggestions([]);
    try {
      setSuggestions(
        await suggestTripNames({
          data: { destination: destination.trim(), startDate, endDate, tripType: tripType.trim() },
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? friendlyError(cause)
          : "Name ideas aren't available right now. You can type your own.",
      );
    } finally {
      setSuggesting(false);
    }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (mode === "create") {
      if (endDate < startDate) {
        setError("Your end date should be after your start date.");
        return;
      }
      if (endDate < today) {
        setError("Choose a trip that is still underway or ahead of you.");
        return;
      }
      const days =
        Math.round(
          (Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 86400000,
        ) + 1;
      if (days < 2 || days > 30) {
        setError("Trips can be 2 to 30 days long.");
        return;
      }
    }
    if (mode === "create" && !playMode) {
      setError("Choose who is playing.");
      return;
    }
    if (
      mode === "create" &&
      playMode === "offline" &&
      (roster.length < 2 ||
        roster.length > 10 ||
        roster.some((n) => gameNameProblem(n.trim())) ||
        new Set(roster.map(normalizeName)).size !== roster.length)
    ) {
      setError("Add 2–10 different first names for your one-phone group.");
      return;
    }
    if (mode === "create" && playMode !== "solo" && minors === null) {
      setError("Tell us if anyone under 18 is joining.");
      return;
    }
    if (mode === "create" && playMode === "solo" && types.length === 0) {
      setError("Choose at least one traveler type.");
      return;
    }
    if (mode === "create" && !name.trim()) {
      if (!suggestions.length) void getSuggestions();
      else setError("Pick a suggestion or type your own trip name.");
      return;
    }
    setBusy(true);
    const result =
      mode === "join"
        ? await supabase.rpc("join_trip", { p_code: code.trim().toUpperCase() })
        : await supabase.rpc(
            "create_trip_play_mode_v3" as never,
            {
              p_name: name.trim(),
              p_destination: destination.trim(),
              p_start_date: startDate,
              p_end_date: endDate,
              p_home_timezone: zone.trim(),
              p_mode: playMode,
              p_country: place.country,
              p_types: playMode === "solo" ? types : [],
            } as never,
          );
    if (!result.error && result.data && mode === "create" && motto.trim())
      await supabase.rpc(
        "set_trip_extras" as never,
        { p_trip: result.data, p_motto: motto.trim(), p_call: null, p_backup: null } as never,
      );
    if (!result.error && result.data && mode === "create") {
      // Under-18 trips are Family-only; the server enforces this on every later vibe change too.
      const settings =
        minors && playMode !== "solo"
          ? await supabase.rpc(
              "set_trip_minors" as never,
              { p_trip: result.data, p_has: true } as never,
            )
          : await supabase.rpc(
              "set_trip_vibe" as never,
              { p_trip: result.data, p_vibe: vibe } as never,
            );
      if (settings.error) {
        setBusy(false);
        setError(friendlyError(settings.error));
        return;
      }
    }
    setBusy(false);
    if (result.error) setError(friendlyError(result.error));
    else if (result.data) {
      if (mode === "join")
        setJoined({
          id: result.data,
          name: preview?.name ?? "Your trip",
          destination: preview?.destination ?? "",
        });
      else {
        if (
          playMode === "offline" &&
          !saveOfflineRoster(
            result.data,
            roster.map((n) => n.trim()),
          )
        )
          setError("This device could not save the player names. Add them again on Play.");
        setCreatedId(result.data);
        setFlightStart(startDefault);
      }
    } else if (mode === "join") setError("That code wasn't found. Check it and try again.");
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-background/80" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={
          mode === "create" ? "Start a trip" : mode === "join" ? "Join a trip" : "Your trip is live"
        }
        className={`relative w-full max-w-lg overflow-y-auto bg-card border border-border p-6 pb-[max(2rem,env(safe-area-inset-bottom))] ${createdId && cinematic ? "h-dvh max-h-dvh" : "max-h-[92dvh] rounded-t-[24px]"}`}
      >
        <div className="w-12 h-1.5 bg-border rounded-full mx-auto mb-6" />
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-5 top-5"
          onClick={onClose}
          aria-label="Close"
        >
          <X />
        </Button>
        {createdId ? (
          <div className="min-h-[35dvh] flex flex-col justify-center">
            <h2 className="font-display text-3xl font-extrabold">Your trip is ready</h2>
            <p className="mt-3">
              {startDate < today
                ? "Takeoff is underway. Trip Season opens after arrival or automatically."
                : startDate <=
                    new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
                  ? "Your flight's soon — Airport Missions open on departure day."
                  : "Pre-Flight starts now."}
            </p>
            {error && (
              <p role="alert" className="text-destructive mt-3">
                {error}
              </p>
            )}
            <Button
              variant="playful"
              className="w-full min-h-11 mt-5"
              onClick={() => onDone(createdId)}
            >
              Open your Trip <ArrowRight />
            </Button>
          </div>
        ) : joined ? (
          <div className="text-center pt-4">
            <span className="text-5xl">💌</span>
            <h2 className="font-display text-3xl font-extrabold mt-4">
              {tripDisplayName(joined.name)}
            </h2>
            <p className="text-muted-foreground mt-2">{joined.destination}</p>
            <p className="mt-5">
              You’re in the waiting room. Your Captain will let you in if approval is needed.
            </p>
            <Button variant="playful" className="w-full mt-6" onClick={() => onDone(joined.id)}>
              Home <ArrowRight />
            </Button>
          </div>
        ) : mode === "celebrate" && trip && phase === "plan" ? (
          <>
            <span className="text-5xl">🎯</span>
            <p className="text-xs text-primary font-extrabold mt-4">STEP 2 OF 3</p>
            <h2 className="font-display font-extrabold text-3xl mt-1">Your game plan</h2>
            <p className="text-sm text-muted-foreground mt-2">
              How should the pre-trip game nights run? You can change this any time in Captain
              Tools.
            </p>
            <GamePlanPicker trip={trip} compact onSaved={() => setPhase("invite")} />
            <Button variant="ghost" className="w-full mt-3" onClick={() => setPhase("invite")}>
              Skip for now — set it later
            </Button>
          </>
        ) : mode === "celebrate" && trip ? (
          <div className="text-center pt-4">
            <p className="text-xs text-primary font-extrabold">STEP 3 OF 3 · INVITE YOUR SQUAD</p>
            <div className="text-7xl mb-4">🎉</div>
            <p className="text-primary font-extrabold text-xs tracking-widest">
              CAPTAIN, IT'S OFFICIAL
            </p>
            <h2 className="font-display font-extrabold text-4xl mt-2">Your trip is live!</h2>
            <p className="font-display font-extrabold text-xl mt-3">{tripDisplayName(trip.name)}</p>
            <Motto text={(trip as { motto?: string | null }).motto} className="mt-1" />
            <p className="text-muted-foreground mt-3">Send the invite to your favorite people.</p>
            <div className="bg-pink-soft rounded-3xl p-5 mt-8">
              <p className="text-xs font-extrabold text-ink-soft">YOUR JOIN CODE</p>
              <div className="mt-3">
                <InviteCode code={trip.join_code} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteUrl(trip.join_code));
                  setCopied(true);
                }}
              >
                <Clipboard />
                {copied ? "Copied!" : "Copy link"}
              </Button>
              <Button
                variant="playful"
                onClick={async () => {
                  const status = await shareInvite(trip.join_code, trip.name);
                  if (status === "copied") setCopied(true);
                }}
              >
                <Share2 />
                Share
              </Button>
            </div>
            <Button variant="ghost" className="mt-5" onClick={onClose}>
              See your trip <ArrowRight />
            </Button>
          </div>
        ) : mode === "join" ? (
          <>
            <span className="text-5xl">💌</span>
            <h2 className="font-display font-extrabold text-3xl mt-3">Join with Code</h2>
            <p className="text-muted-foreground mt-2 text-sm">{ROOM_COPY.join}</p>
            <form className="mt-7 space-y-4" onSubmit={(event) => void submit(event)}>
              <label className="block text-xs font-extrabold text-muted-foreground">
                INVITE CODE
                <input
                  aria-label="Invite code"
                  required
                  maxLength={8}
                  minLength={6}
                  pattern="[A-Za-z]{6}|[A-Za-z]{8}"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                  placeholder="JOIN CODE"
                  autoCapitalize="characters"
                  className={`${field} mt-2 font-display text-2xl text-center tracking-widest uppercase`}
                />
              </label>
              {preview && (
                <div className="rounded-2xl bg-blue-soft p-4 text-center">
                  <p className="text-xs font-extrabold text-blue">YOU'RE JOINING</p>
                  <p className="font-display font-extrabold text-xl mt-1">
                    {tripDisplayName(preview.name)}
                  </p>
                  <p className="text-sm text-muted-foreground">{preview.destination}</p>
                  <Motto text={preview.motto} className="text-sm mt-1" />
                </div>
              )}
              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
              <Button variant="playful" size="lg" className="w-full" disabled={busy}>
                {busy ? "Joining..." : "Join room"}
                <Ticket />
              </Button>
            </form>
          </>
        ) : createStep === "who" ? (
          <>
            <Button variant="ghost" onClick={() => setCreateStep("dates")}>
              <ArrowLeft /> Back
            </Button>
            <h2 className="font-display font-extrabold text-3xl mt-4">Who's playing?</h2>
            <PlayingChoice
              price="trip"
              onChoose={(chosen) => {
                setPlayMode(chosen);
                setCreateStep("details");
                setError("");
              }}
            />
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              className={createStep === "dates" ? "hidden" : "min-h-11"}
              onClick={() => setCreateStep("who")}
            >
              <ArrowLeft /> Back
            </Button>
            <span className={createStep === "dates" ? "text-5xl" : "hidden"}>🧳</span>
            <p className="text-xs text-primary font-extrabold mt-4">STEP 1 OF 3</p>
            <h2 className="font-display font-extrabold text-3xl mt-1">Trip basics</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Just the essentials. Itinerary, prizes, teams and costs can wait for your Captain
              checklist.
            </p>
            <form
              className="mt-6 space-y-4"
              onSubmit={(event) => {
                if (createStep === "dates") {
                  event.preventDefault();
                  setError("");
                  if (
                    !place.country ||
                    !startDate ||
                    !endDate ||
                    endDate < startDate ||
                    endDate < today
                  ) {
                    setError("Choose a destination and valid trip dates.");
                    return;
                  }
                  setCreateStep("who");
                } else void submit(event);
              }}
            >
              <div className={createStep === "dates" ? "" : "hidden"}>
                <p className="mb-2 text-sm font-bold">Destination</p>
                <PlacePicker value={place} onChange={(p) => updatePlace(p)} />
                <p className="mt-2 text-sm text-muted-foreground">{destination}</p>
                {place.country && place.city && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => {
                      const next = [...stops, place.city ?? ""];
                      setStops(next);
                      setPlace({ ...place, city: null });
                      setDestination(`${next.join(" + ")}, ${countryName(place.country ?? "")}`);
                    }}
                  >
                    + Add another stop
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-bold">
                  Start date
                  <input
                    type="date"
                    className={`${field} mt-2`}
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </label>
                <label className="block text-sm font-bold">
                  End date
                  <input
                    type="date"
                    className={`${field} mt-2`}
                    min={startDate}
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </label>
              </div>
              <div className={createStep === "details" ? "space-y-4" : "hidden"}>
                {playMode === "solo" && (
                  <div>
                    <p className="text-sm font-bold">What kind of traveler are you?</p>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {(
                        [
                          ["foodie", "Foodie"],
                          ["explorer", "Explorer"],
                          ["culture", "Culture buff"],
                          ["chill", "Chill"],
                          ["photographer", "Photographer"],
                          ["shopper", "Shopper"],
                        ] as const
                      ).map(([id, label]) => (
                        <Button
                          key={id}
                          type="button"
                          variant={types.includes(id) ? "playful" : "outline"}
                          className="min-h-11"
                          disabled={!types.includes(id) && types.length >= 2}
                          onClick={() =>
                            setTypes(
                              types.includes(id) ? types.filter((x) => x !== id) : [...types, id],
                            )
                          }
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {playMode === "offline" && (
                  <div>
                    <p className="text-sm font-bold">How many players?</p>
                    <div className="flex gap-3 items-center mt-2">
                      <Button
                        type="button"
                        variant="outline"
                        aria-label="Fewer players"
                        disabled={roster.length <= 2}
                        onClick={() => setRoster(roster.slice(0, -1))}
                      >
                        −
                      </Button>
                      <span>{roster.length}</span>
                      <Button
                        type="button"
                        variant="outline"
                        aria-label="More players"
                        disabled={roster.length >= 10}
                        onClick={() => setRoster([...roster, ""])}
                      >
                        +
                      </Button>
                    </div>
                    {roster.map((player, i) => (
                      <label key={i} className="block text-sm mt-2">
                        Seat {i + 1} · first name
                        <input
                          className={field}
                          maxLength={15}
                          value={player}
                          onChange={(e) =>
                            setRoster(roster.map((n, j) => (j === i ? e.target.value : n)))
                          }
                        />
                      </label>
                    ))}
                    <p className="text-sm text-muted-foreground mt-2">
                      Names and scores stay on this device; another device cannot recover them.
                    </p>
                  </div>
                )}
                <label className="block text-sm font-bold">
                  Trip name
                  <input
                    className={`${field} mt-2`}
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your own name or pick an idea"
                  />
                </label>
                <Button
                  type="button"
                  variant="subtle"
                  onClick={() => void getSuggestions()}
                  disabled={suggesting || busy}
                  className="w-full"
                >
                  <Sparkles size={18} />
                  {suggesting ? "Thinking up names…" : "Suggest names"}
                </Button>
                {suggestions.length > 0 && (
                  <div className="space-y-2" aria-label="Suggested trip names">
                    <p className="text-xs font-extrabold text-muted-foreground">
                      PICK ONE, OR WRITE YOUR OWN
                    </p>
                    {suggestions.map((idea) => (
                      <Button
                        key={idea}
                        type="button"
                        variant={name === idea ? "green" : "outline"}
                        className="w-full min-h-12 h-auto whitespace-normal py-2"
                        onClick={() => {
                          setName(idea);
                          setError("");
                        }}
                      >
                        {idea}
                      </Button>
                    ))}
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold mb-2">Is anyone under 18 joining?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      className="min-h-11"
                      variant={minors === true ? "playful" : "outline"}
                      onClick={() => {
                        setMinors(true);
                        setVibe("family" as Vibe);
                      }}
                    >
                      Yes
                    </Button>
                    <Button
                      type="button"
                      className="min-h-11"
                      variant={minors === false ? "playful" : "outline"}
                      onClick={() => setMinors(false)}
                    >
                      No
                    </Button>
                  </div>
                  {minors && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Family content only. Party and 21+ cards stay off for this trip.
                    </p>
                  )}
                </div>
                {playMode !== "solo" && !minors && (
                  <div>
                    <p className="text-sm font-bold mb-2">Trip vibe</p>
                    <VibePicker value={vibe} onChange={setVibe} />
                  </div>
                )}
                <details className="rounded-2xl bg-muted/40 p-3">
                  <summary className="text-sm font-bold cursor-pointer">
                    More options (optional)
                  </summary>
                  <div className="space-y-4 mt-3">
                    <label className="block text-sm font-bold">
                      What kind of trip?
                      <input
                        className={`${field} mt-2`}
                        maxLength={60}
                        value={tripType}
                        onChange={(e) => setTripType(e.target.value)}
                        placeholder="Birthday, friends weekend, road trip…"
                      />
                    </label>
                    <MottoField
                      value={motto}
                      onChange={setMotto}
                      name={name}
                      destination={destination}
                      tripType={tripType}
                      className={`${field} mt-2`}
                    />
                    <label className="block text-sm font-bold">
                      Home time zone
                      <input
                        className={`${field} mt-2`}
                        required
                        maxLength={100}
                        value={zone}
                        onChange={(e) => setZone(e.target.value)}
                      />
                    </label>
                    <p className="text-muted-foreground text-xs">
                      Game nights use this time zone. Paste your itinerary later from Captain Tools.
                    </p>
                  </div>
                </details>
              </div>
              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
              <Button variant="playful" size="lg" className="w-full" disabled={busy || suggesting}>
                {busy
                  ? "Making magic..."
                  : createStep === "dates"
                    ? "Next: who's playing?"
                    : "Create"}
                <ArrowRight />
              </Button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
