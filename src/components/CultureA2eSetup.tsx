import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlacePicker } from "@/components/PlacePicker";
import { RoomExperienceCard } from "@/components/RoomExperienceCard";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { countryName, type Place } from "@/lib/places";
import { SAMPLE_EXPERIENCES } from "@/lib/inspiration-samples";
import { CULTURE_LAYERS, type CultureLayer } from "@/lib/culture-pool";
import { PlayingChoice } from "./PlayingChoice";
import { saveOfflineRoster, type PlayArrangement } from "@/lib/play-arrangement";
import { gameNameProblem, normalizeName } from "@/lib/game-name";

export type A2eKind = "explore" | "show" | "inspire";
const travelerTypes = [
  ["foodie", "Foodie"],
  ["explorer", "Explorer"],
  ["culture", "Culture buff"],
  ["chill", "Chill"],
  ["photographer", "Photographer"],
  ["night_owl", "Night owl (21+)"],
  ["shopper", "Shopper"],
] as const;
const field =
  "mt-2 w-full rounded-xl border border-border bg-card p-3 text-base text-foreground outline-none focus:border-primary";
export function CultureA2eSetup({
  kind,
  onDone,
  onBack,
  ageRange,
}: {
  kind: A2eKind;
  onDone: (id: string) => void;
  onBack: () => void;
  ageRange?: string;
}) {
  const [accountAge, setAccountAge] = useState(ageRange ?? "Unknown");
  useEffect(() => {
    let live = true;
    void supabase.rpc("my_access").then(({ data }) => {
      if (live) setAccountAge(data?.[0]?.age_range ?? "Unknown");
    });
    return () => {
      live = false;
    };
  }, []);
  const [mode, setMode] = useState<"solo" | "group" | null>(null);
  const [choice, setChoice] = useState<PlayArrangement | null>(null);
  const [roster, setRoster] = useState<string[]>(["", ""]);
  const [step, setStep] = useState(0),
    [place, setPlace] = useState<Place>({ country: null, region: null, city: null });
  const [layer, setLayer] = useState<CultureLayer | null>(null),
    [types, setTypes] = useState<string[]>([]),
    [vibe, setVibe] = useState("family");
  const [start, setStart] = useState(new Date().toLocaleDateString("en-CA")),
    [end, setEnd] = useState(""),
    [days, setDays] = useState(3),
    [prep, setPrep] = useState(0);
  const [finale, setFinale] = useState<"two_nights" | "finale_only">("finale_only"),
    [finalePlace, setFinalePlace] = useState(""),
    [title, setTitle] = useState(""),
    [repeat, setRepeat] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const travelDays =
    end && start && end >= start
      ? Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000) +
        1
      : 0;
  const isHome = kind !== "inspire";
  const group = mode === "group";
  const adultCaptain = accountAge === "21+";
  const teen = accountAge.startsWith("Teen");
  const sequence: readonly string[] = [
    "place",
    "dates",
    "who",
    ...(choice === "offline" ? ["players"] : []),
    "style",
    ...(isHome && group ? ["finale"] : []),
    "name",
  ];
  const rosterMin = kind === "inspire" ? 1 : 2,
    rosterMax = kind === "inspire" ? 3 : 10;
  const stepName = sequence[step] ?? "name";
  const name =
    kind === "show"
      ? "Show your culture"
      : kind === "explore"
        ? "Explore a Culture"
        : "Window Seat";
  const label =
    place.city || place.region || (place.country ? countryName(place.country) : "Your culture");
  const defaultName =
    kind === "show"
      ? `My ${label} Culture · ${CULTURE_LAYERS.find((l) => l.id === layer)?.label ?? "Guide"}`
      : `${label} ${isHome ? "From Home" : "Guide"}`;
  async function create() {
    if (!place.country || !mode) return;
    if (
      choice === "offline" &&
      (roster.length < rosterMin ||
        roster.length > rosterMax ||
        roster.some((n) => gameNameProblem(n.trim())) ||
        new Set(roster.map(normalizeName)).size !== roster.length)
    ) {
      setError(`Add ${rosterMin}–${rosterMax} different first names.`);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const { data, error: e } = await (
        supabase as unknown as {
          rpc: (
            name: string,
            args: object,
          ) => Promise<{ data: string | null; error: { message: string } | null }>;
        }
      ).rpc(kind === "inspire" ? "create_window_play_mode" : "create_culture_play_mode", {
        ...(kind === "inspire"
          ? { p_mode: choice === "offline" ? "offline" : mode }
          : { p_kind: kind, p_mode: choice }),
        p_title: title.trim() || defaultName,
        p_country: place.country,
        p_region: place.region ?? "",
        p_city: place.city ?? "",
        p_start: start,
        p_days: isHome ? days : travelDays,
        ...(isHome ? { p_layer: layer } : {}),
        p_vibe: vibe,
        p_types: mode === "solo" ? types : [],
        ...(kind === "inspire" ? { p_prep: !group ? prep : 0 } : {}),
        ...(isHome
          ? {
              p_finale: group ? finale : null,
              p_place: group ? finalePlace : null,
              p_repeat: repeat,
            }
          : {}),
      });
      if (e) throw e;
      if (data) {
        if (choice === "offline") {
          const room = await supabase
            .from("culture_experiences")
            .select("trip_id")
            .eq("id", data)
            .eq("creator_id", (await supabase.auth.getUser()).data.user?.id ?? "")
            .maybeSingle();
          if (
            room.data?.trip_id &&
            !saveOfflineRoster(
              room.data.trip_id,
              roster.map((n) => n.trim()),
            )
          )
            setError("This device could not save the player names. Add them again on Play.");
        }
        onDone(data);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  const back = () => {
    setError("");
    if (step) setStep(step - 1);
    else onBack();
  };
  return (
    <section
      className={`mt-6 min-w-0 pb-8 room-story-shell ${isHome ? "home-culture-content home-room-scene" : "window-seat-content window-room-scene"}`}
      aria-label={`${name} setup`}
    >
      <Button variant="ghost" className="min-h-11" onClick={back}>
        <ArrowLeft size={18} /> Back
      </Button>
      <RoomExperienceCard room={isHome ? "home" : "window"} showSave={false}>
        <p className="eyebrow mt-3 text-blue">
          {name.toUpperCase()} · {`STEP ${step + 1} OF ${sequence.length}`}
        </p>
        {stepName === "who" ? (
          <>
            <h1 className="mt-2 font-display text-2xl font-extrabold">Who's playing?</h1>
            <PlayingChoice
              price={kind === "inspire" ? "window" : "culture"}
              exclude={kind === "explore" ? ["solo"] : []}
              onChoose={(c) => {
                if (c !== "solo" && !adultCaptain) {
                  setError("Captains must be 21 or older.");
                  return;
                }
                setChoice(c);
                setMode(c === "solo" ? "solo" : "group");
                setStep(step + 1);
                setError("");
              }}
            />
            {!adultCaptain && (
              <p className="mt-3 text-sm text-muted-foreground">
                Group rooms need a Captain who is 21 or older.
              </p>
            )}
          </>
        ) : stepName === "place" ? (
          <>
            <h1 className="mt-2 font-display text-2xl font-extrabold">
              {kind === "show"
                ? "Which culture is yours?"
                : isHome
                  ? "Which culture will you explore?"
                  : "Where are you going?"}
            </h1>
            <PlacePicker value={place} onChange={setPlace} items={SAMPLE_EXPERIENCES} />
            <Button
              variant="playful"
              className="mt-5 w-full min-h-11"
              disabled={!place.country}
              onClick={() => setStep(step + 1)}
            >
              Next <ArrowRight size={18} />
            </Button>
          </>
        ) : stepName === "style" ? (
          <>
            <h1 className="mt-2 font-display text-2xl font-extrabold">
              {isHome ? "What part of the culture?" : "What kind of traveler are you?"}
            </h1>
            {isHome ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {CULTURE_LAYERS.filter((l) => kind === "explore" || l.id !== "mixed").map((l) => (
                  <Button
                    key={l.id}
                    variant={layer === l.id ? "playful" : "outline"}
                    className="min-h-14 h-auto whitespace-normal text-left"
                    onClick={() => setLayer(l.id)}
                  >
                    {l.label}
                  </Button>
                ))}
              </div>
            ) : mode === "solo" ? (
              <>
                <p className="mt-2 text-sm text-muted-foreground">Choose up to two.</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {travelerTypes
                    .filter(([id]) => id !== "night_owl" || adultCaptain)
                    .map(([id, text]) => (
                      <Button
                        key={id}
                        variant={types.includes(id) ? "playful" : "outline"}
                        className="min-h-11 h-auto whitespace-normal"
                        disabled={!types.includes(id) && types.length >= 2}
                        onClick={() =>
                          setTypes(
                            types.includes(id) ? types.filter((x) => x !== id) : [...types, id],
                          )
                        }
                      >
                        {text}
                      </Button>
                    ))}
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm">Choose your squad's vibe.</p>
            )}
            {(isHome || mode !== "solo") && (
              <>
                <p className="mt-5 font-bold">Your vibe</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["family", "chill", "party"] as const)
                    .filter((v) => !teen || v === "family")
                    .filter((v) => v !== "party" || adultCaptain)
                    .map((v) => (
                      <Button
                        key={v}
                        variant={vibe === v ? "playful" : "outline"}
                        className="min-h-11 h-auto whitespace-normal"
                        onClick={() => setVibe(v)}
                      >
                        {v === "party" ? "Party (21+)" : v[0]?.toUpperCase() + v.slice(1)}
                      </Button>
                    ))}
                </div>
              </>
            )}
            {kind === "show" && (
              <label className="mt-4 flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={repeat}
                  onChange={(e) => setRepeat(e.target.checked)}
                  className="size-5"
                />{" "}
                Do it again (if you've finished this layer before)
              </label>
            )}
            <Button
              variant="playful"
              className="mt-5 w-full min-h-11"
              disabled={
                (isHome && !layer) || (kind === "inspire" && mode === "solo" && !types.length)
              }
              onClick={() => setStep(step + 1)}
            >
              Next <ArrowRight size={18} />
            </Button>
          </>
        ) : stepName === "dates" ? (
          <>
            <h1 className="mt-2 font-display text-2xl font-extrabold">
              {isHome ? "How many days?" : "Your trip dates"}
            </h1>
            {isHome && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[2, 3, 4, 5, 6, 7].map((d) => (
                  <Button
                    key={d}
                    variant={days === d ? "playful" : "outline"}
                    className="min-h-11"
                    onClick={() => {
                      setDays(d);
                      if (d < 4) setFinale("finale_only");
                    }}
                  >
                    {d} days
                  </Button>
                ))}
              </div>
            )}
            <label className="mt-4 block font-bold">
              First day
              <input
                type="date"
                className={field}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            {!isHome && (
              <>
                <label className="mt-4 block font-bold">
                  Last day
                  <input
                    type="date"
                    className={field}
                    min={start}
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
                {!group && (
                  <label className="mt-4 block font-bold">
                    Optional preparation before travel
                    <select
                      className={field}
                      value={prep}
                      onChange={(e) => setPrep(Number(e.target.value))}
                    >
                      {Array.from({ length: 11 }, (_, i) => (
                        <option key={i} value={i}>
                          {i === 0 ? "None" : `${i} day${i === 1 ? "" : "s"}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
            <Button
              variant="playful"
              className="mt-5 w-full min-h-11"
              disabled={
                !start ||
                start < new Date().toLocaleDateString("en-CA") ||
                (!isHome && travelDays < 1)
              }
              onClick={() => setStep(step + 1)}
            >
              Next <ArrowRight size={18} />
            </Button>
          </>
        ) : stepName === "players" ? (
          <>
            <h1 className="mt-2 font-display text-2xl font-extrabold">How many players?</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Friends playing with you on this phone (you are the Captain, up to {rosterMax}).
            </p>
            <div className="mt-4 flex gap-3 items-center">
              <Button
                variant="outline"
                className="min-h-11"
                disabled={roster.length <= rosterMin}
                onClick={() => setRoster(roster.slice(0, -1))}
              >
                −
              </Button>
              <span>{roster.length}</span>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={roster.length >= rosterMax}
                onClick={() => setRoster([...roster, ""])}
              >
                +
              </Button>
            </div>
            {roster.map((n, i) => (
              <label key={i} className="block text-sm mt-2">
                Seat {i + 1} · first name
                <input
                  className={field}
                  maxLength={15}
                  value={n}
                  onChange={(e) => setRoster(roster.map((v, j) => (i === j ? e.target.value : v)))}
                />
              </label>
            ))}
            <p className="text-sm text-muted-foreground mt-2">
              Names and scores stay on this device; another device cannot recover them.
            </p>
            <Button
              variant="playful"
              className="mt-5 w-full min-h-11"
              onClick={() => {
                if (
                  roster.some((n) => gameNameProblem(n.trim())) ||
                  new Set(roster.map(normalizeName)).size !== roster.length
                ) {
                  setError(`Add ${rosterMin}–${rosterMax} different first names.`);
                  return;
                }
                setError("");
                setStep(step + 1);
              }}
            >
              Next <ArrowRight size={18} />
            </Button>
          </>
        ) : stepName === "finale" ? (
          <>
            <h1 className="mt-2 font-display text-2xl font-extrabold">Your finale</h1>
            <p className="mt-2 text-sm">
              Showcase revealed on day one. Present and crown someone together on the last day.
            </p>
            <div className="mt-4 grid gap-2">
              <Button
                variant={finale === "two_nights" ? "playful" : "outline"}
                disabled={days < 4}
                className="min-h-14 h-auto whitespace-normal"
                onClick={() => setFinale("two_nights")}
              >
                Two game nights · halfway video call, then the finale
              </Button>
              <Button
                variant={finale === "finale_only" ? "playful" : "outline"}
                className="min-h-14"
                onClick={() => setFinale("finale_only")}
              >
                Just the finale
              </Button>
            </div>
            <label className="mt-4 block font-bold">
              In-person finale place
              <input
                className={field}
                maxLength={120}
                placeholder="A place your squad will agree on"
                value={finalePlace}
                onChange={(e) => setFinalePlace(e.target.value)}
              />
            </label>
            <Button
              variant="playful"
              className="mt-5 w-full min-h-11"
              disabled={finalePlace.trim().length < 2}
              onClick={() => setStep(step + 1)}
            >
              Next <ArrowRight size={18} />
            </Button>
          </>
        ) : (
          <>
            <h1 className="mt-2 font-display text-2xl font-extrabold">Name it</h1>
            <label className="mt-4 block font-bold">
              Title
              <input
                className={field}
                maxLength={120}
                placeholder={defaultName}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <div className="mt-4 border-t border-border pt-3 text-sm">
              <p>
                <strong>{title.trim() || defaultName}</strong> · {label}
              </p>
              <p>
                {isHome
                  ? `${days} days · ${CULTURE_LAYERS.find((l) => l.id === layer)?.label}`
                  : `${start} – ${end}`}{" "}
                ·{" "}
                {choice === "solo"
                  ? "Just me"
                  : choice === "offline"
                    ? `Me + ${roster.length} friends NOT on the app`
                    : "Me + friends on the app"}
              </p>
              {group && (
                <p className="mt-2 flex items-center gap-2">
                  <Crown size={16} />{" "}
                  {choice === "offline"
                    ? "You'll be Captain. Names and scores stay on this device; no join code."
                    : "You'll be Captain of a new room with a join code."}
                </p>
              )}
            </div>
            <Button
              variant="playful"
              className="mt-5 w-full min-h-11"
              disabled={busy}
              onClick={() => void create()}
            >
              {busy ? "Creating…" : "Create and plan"} <ArrowRight size={18} />
            </Button>
          </>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </RoomExperienceCard>
    </section>
  );
}
