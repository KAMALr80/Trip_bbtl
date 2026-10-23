import { rpc } from "@/data/rpc";
import { useEffect, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { CountryFlag } from "@/components/CountryFlag";
import { TripFlag } from "@/components/TripFlag";
import { TripSectionIcon } from "@/components/TripSectionIcon";
import { COUNTRIES } from "@/lib/places";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { PACKS } from "@/components/AtHome";
import type { TripWithRole } from "@/lib/trips";
import { FoundingBadge } from "@/components/LegalConsent";
import { Avatar } from "@/components/PlayerCards";
import { dicebearUrl } from "@/lib/player-cards";
import { CultureBadgeRow } from "@/components/CultureBadgeRow";
import { tripDisplayName } from "@/lib/trip-display-name";
import { tripStatus } from "@/components/TripList";
import { friendlyError } from "@/lib/friendly-error";

import { ROOM_COPY } from "@/lib/room-copy";
import { BrandLockup } from "@/components/BrandLockup";
import iconBoarding from "@/assets/icon-boarding-pass.webp";
import iconMap from "@/assets/icon-map.webp";
import iconHome from "@/assets/icon-at-home.webp";
import iconPostcard from "@/assets/icon-postcard.webp";
import seaside from "@/assets/passport-seaside.jpg";
import { CULTURE_LAYERS } from "@/lib/culture-pool";

import { countCountries, levelFor } from "@/lib/levels";

type Ink = {
  trip_id: string;
  kind: "international" | "road_trip";
  country: string;
  state: string | null;
  city: string | null;
  stamped_on: string;
  trip_name: string;
  destination: string;
  start_date: string;
  squad_count: number;
};
type Postcard = { trip_id: string; pack: string; created_at: string };
type CultureStamp = {
  card_id: string;
  title: string;
  points: number;
  champion: boolean;
  created_at: string;
};
type Collectible = { trip_id: string; kind: "postcard"; pack: string; created_at: string } | Ink;
type PassportDestination = "preflight" | "touchdown" | "athome" | "culture";
const date = (value: string) =>
  new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/** Passport level by countries stamped (R-703); replaces the retired Junkie Rank (L7). */
export function TravelerLevel({
  userId,
  progress = false,
}: {
  userId: string;
  progress?: boolean;
}) {
  const [countries, setCountries] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void supabase
      .from("passport_stamps")
      .select("country")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (live) setCountries(countCountries(data ?? []));
      });
    return () => {
      live = false;
    };
  }, [userId]);
  const level = countries === null ? null : levelFor(countries);
  if (!level) return null;
  return (
    <span className={progress ? "block w-full" : "inline-flex"}>
      <span
        className="passport-stamp inline-flex border-blue text-blue px-3 py-1 text-xs font-extrabold uppercase"
        aria-label={`Level: ${level.name}`}
      >
        ✈ {level.name}
      </span>
      {progress && (
        <span className="block text-xs mt-1 text-muted-foreground">
          {level.countries} {level.countries === 1 ? "country" : "countries"}
          {level.next
            ? ` · ${level.next.at - level.countries} more to ${level.next.name}`
            : " · top level"}
        </span>
      )}
    </span>
  );
}
export function CultureCreatorBadge({ userId }: { userId: string }) {
  const [badge, setBadge] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void rpc("culture_creator_badge", { p_user: userId }).then(({ data }) => {
      if (live) setBadge(data ?? null);
    });
    return () => {
      live = false;
    };
  }, [userId]);
  return badge ? (
    <span
      className="passport-stamp inline-flex border-orange text-orange px-3 py-1 text-xs font-extrabold"
      aria-label={`Culture creator: ${badge}`}
    >
      ✦ {badge}
    </span>
  ) : null;
}
export function CulturePoints({ userId }: { userId: string }) {
  const [points, setPoints] = useState(0);
  useEffect(() => {
    let live = true;
    void supabase
      .from("culture_stamps")
      .select("points")
      .eq("user_id", userId)
      .then(({ data }: { data: { points: number }[] | null }) => {
        if (live) setPoints((data ?? []).reduce((total, row) => total + row.points, 0));
      });
    return () => {
      live = false;
    };
  }, [userId]);
  return (
    <span className="text-sm font-bold text-orange" aria-label={`${points} Culture Points`}>
      ✦ {points} Culture Points
    </span>
  );
}
function MorePanel({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!count) return null;
  return (
    <>
      <Button
        variant="ghost"
        className="passport-more mt-3"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Less" : `More ${title}`}{" "}
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && (
        <div className="passport-more-content" role="region" aria-label={`More ${title}`}>
          {children}
        </div>
      )}
    </>
  );
}

export function PassportBook({
  trips,
  selectTrip,
  userId,
  onNavigate,
}: {
  trips: TripWithRole[];
  selectTrip: (id: string) => void;
  userId: string;
  onNavigate?: (screen: PassportDestination) => void;
}) {
  const [ink, setInk] = useState<Ink[]>([]),
    [postcards, setPostcards] = useState<Postcard[]>([]),
    [home, setHome] = useState(""),
    [entry, setEntry] = useState<
      Collectible | "sample-stamp" | "sample-postcard" | "sample-trip" | null
    >(null),
    [postcardSquad, setPostcardSquad] = useState<number | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [identity, setIdentity] = useState<{
      game_name: string;
      avatar_style: string;
      avatar_seed: string;
      avatar_path: string | null;
      hometown: string | null;
      trip_persona: string | null;
    } | null>(null),
    [avatarPhoto, setAvatarPhoto] = useState("");
  const [culture, setCulture] = useState<CultureStamp[]>([]),
    [cultureOpen, setCultureOpen] = useState(false),
    [story, setStory] = useState<{
      title: string;
      backstory: string;
      steps: string;
      meaning: string;
    } | null>(null),
    [cultureError, setCultureError] = useState("");
  const [layers, setLayers] = useState<
    { country: string; culture_layer: string; earned_at: string }[]
  >([]);
  useEffect(() => {
    let live = true;
    void supabase
      .from("culture_layer_stamps")
      .select("country,culture_layer,earned_at")
      .eq("creator_id", userId)
      .order("earned_at", { ascending: false })
      .then(({ data }: { data: typeof layers | null }) => {
        if (live) setLayers(data ?? []);
      });
    return () => {
      live = false;
    };
  }, [userId]);
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null),
    [night, setNight] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void supabase
      .from("player_profiles")
      .select("game_name,avatar_style,avatar_seed,avatar_path,hometown,trip_persona")
      .eq("user_id", userId)
      .maybeSingle()
      .then(async ({ data }: { data: typeof identity }) => {
        if (!live || !data) return;
        setIdentity(data);
        if (data.avatar_style === "photo" && data.avatar_path) {
          const signed = await supabase.storage
            .from("player-avatars")
            .createSignedUrl(data.avatar_path, 3600);
          if (live) setAvatarPhoto(signed.data?.signedUrl ?? "");
        }
      });
    return () => {
      live = false;
    };
  }, [userId]);
  useEffect(() => {
    let live = true;
    void supabase
      .from("culture_stamps")
      .select("card_id,title,points,champion,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }: { data: CultureStamp[] | null }) => {
        if (live) setCulture(data ?? []);
      });
    return () => {
      live = false;
    };
  }, [userId]);
  useEffect(() => {
    let live = true;
    void Promise.all([
      rpc("passport_collection"),
      supabase.from("postcard_stickers").select("trip_id,pack,created_at").eq("user_id", userId),
      supabase.from("player_profiles").select("home_country").eq("user_id", userId).maybeSingle(),
    ]).then(([stamps, cards, profile]) => {
      if (!live) return;
      setInk((stamps.data ?? []) as Ink[]);
      setPostcards(cards.data ?? []);
      setHome(profile.data?.home_country ?? "");
      setError(stamps.error ? friendlyError(stamps.error) : "");
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [userId, trips]);
  useEffect(() => {
    if (typeof entry === "string" || entry?.kind !== "postcard") {
      setPostcardSquad(null);
      return;
    }
    let live = true;
    void supabase
      .from("trip_members")
      .select("user_id", { count: "exact", head: true })
      .eq("trip_id", entry.trip_id)
      .eq("status", "approved")
      .then(({ count }: { count: number | null }) => {
        if (live) setPostcardSquad(count);
      });
    return () => {
      live = false;
    };
  }, [entry]);
  useEffect(() => {
    const trip = trips.find((t) => t.kind !== "at_home" && tripStatus(t) !== "Completed");
    if (!trip) return;
    let live = true;
    void supabase
      .from("game_nights")
      .select("starts_at")
      .eq("trip_id", trip.id)
      .eq("skipped", false)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(1)
      .then(({ data }) => {
        if (live) setNight(data?.[0]?.starts_at ?? null);
      });
    return () => {
      live = false;
    };
  }, [trips]);
  const [askHome, setAskHome] = useState(false),
    [guess, setGuess] = useState("");
  useEffect(() => {
    let live = true;
    void supabase
      .from("profiles")
      .select("seen_tips")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }: { data: { seen_tips?: string[] } | null }) => {
        if (!live || (data?.seen_tips ?? []).includes("home_country")) return;
        let name = "";
        try {
          const region = new Intl.Locale(navigator.language).maximize().region;
          if (region) name = new Intl.DisplayNames(["en"], { type: "region" }).of(region) ?? "";
        } catch {
          /* no region */
        }
        setGuess(name);
        setAskHome(true);
      });
    return () => {
      live = false;
    };
  }, [userId]);
  async function saveHome(value: string) {
    const trimmed = value.trim();
    if (trimmed && (trimmed.length < 2 || trimmed.length > 40)) {
      setError("Home country should be 2–40 characters.");
      return;
    }
    const { error: e } = await supabase
      .from("player_profiles")
      .update({ home_country: trimmed || null })
      .eq("user_id", userId);
    if (e) {
      setError("Couldn't save your home country.");
      return;
    }
    setError("");
    const result = await rpc("passport_collection");
    setInk((result.data ?? []) as Ink[]);
    if (result.error) setError(friendlyError(result.error));
  }
  async function confirmHome(value: string) {
    if (value.trim()) {
      const trimmed = value.trim();
      if (trimmed.length < 2 || trimmed.length > 40) {
        setError("Home country should be 2–40 characters.");
        return;
      }
      setHome(trimmed);
      await saveHome(trimmed);
    }
    const { data } = await supabase
      .from("profiles")
      .select("seen_tips")
      .eq("id", userId)
      .maybeSingle();
    const seen: string[] = data?.seen_tips ?? [];
    await supabase
      .from("profiles")
      .update({ seen_tips: [...new Set([...seen, "home_country"])] })
      .eq("id", userId);
    setAskHome(false);
  }
  async function openCulture(stamp: CultureStamp) {
    const r = await supabase
      .from("cultural_inspirations")
      .select("title,backstory,steps,meaning")
      .eq("id", stamp.card_id)
      .maybeSingle();
    if (r.error) setCultureError(friendlyError(r.error));
    else setStory(r.data);
  }
  const stamps = [...ink].sort((a, b) => b.stamped_on.localeCompare(a.stamped_on));
  const cards = [...postcards].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const countries = new Set(ink.map((s) => s.country));
  const shownTrips = [...trips].sort((a, b) => {
    const rank = (t: TripWithRole) =>
      t.is_sandbox
        ? 4
        : t.kind === "at_home"
          ? 2
          : tripStatus(t) === "Active"
            ? 0
            : tripStatus(t) === "Upcoming"
              ? 1
              : 3;
    return rank(a) - rank(b) || a.start_date.localeCompare(b.start_date);
  });
  const activeTrip =
    shownTrips.find((t) => tripStatus(t) === "Active") ??
    shownTrips.find((t) => tripStatus(t) === "Upcoming");
  const currentPhase: PassportDestination =
    activeTrip?.kind === "at_home"
      ? "athome"
      : activeTrip && tripStatus(activeTrip) === "Active"
        ? "touchdown"
        : activeTrip
          ? "preflight"
          : "culture";
  const samplePlace =
    ["Bangkok", "Mexico City", "Tokyo", "Athens", "Rio de Janeiro", "Nairobi"][
      Array.from(userId).reduce((n, c) => n + c.charCodeAt(0), 0) % 6
    ] ?? "Bangkok";
  const sampleCountry =
    ["TH", "MX", "JP", "GR", "BR", "KE"][
      ["Bangkok", "Mexico City", "Tokyo", "Athens", "Rio de Janeiro", "Nairobi"].indexOf(
        samplePlace,
      )
    ] ?? "TH";
  const phases: { key: PassportDestination; name: string; copy: string; icon: string }[] = [
    { key: "preflight", name: "Pre-Flight", copy: "Game nights before", icon: iconBoarding },
    { key: "touchdown", name: "Trip Season", copy: "Games on the trip", icon: iconMap },
    { key: "athome", name: "At Home", copy: "Your couch, any country", icon: iconHome },
    { key: "culture", name: "Culture", copy: "Share & play quests", icon: iconPostcard },
  ];
  function stamp(s: Ink) {
    const trip = trips.find((t) => t.id === s.trip_id);
    return (
      <Button
        key={s.trip_id}
        variant="ghost"
        className="passport-visa-stamp"
        onClick={() => setEntry(s)}
        aria-label={`Open ${s.city ?? s.state ?? s.country} stamp`}
      >
        <span className="flex items-center gap-2">
          {trip ? (
            <TripFlag trip={trip} className="h-4 w-6" />
          ) : (
            <CountryFlag
              code={
                COUNTRIES.find((c) => c.name.toLowerCase() === s.country.toLowerCase())?.code ??
                s.country
              }
              className="h-4 w-6"
            />
          )}
          <strong className="truncate">{s.city ?? s.state ?? s.country}</strong>
        </span>
        <small>{date(s.stamped_on)}</small>
      </Button>
    );
  }
  function postcard(c: Postcard) {
    const pack = PACKS.find((p) => p.key === c.pack);
    return (
      <Button
        key={c.trip_id}
        variant="ghost"
        className="passport-mini-postcard"
        onClick={() => setEntry({ ...c, kind: "postcard" })}
        aria-label={`Open ${pack?.name ?? c.pack} postcard`}
      >
        <span className="passport-pin" />
        <span className="passport-postcard-photo">
          {pack && <img src={pack.img} alt="" loading="lazy" />}
        </span>
        <span className="flex items-center gap-1 w-full">
          <CountryFlag code={pack?.code ?? ""} className="h-3 w-[18px] shrink-0" />
          <strong className="truncate">{pack?.name ?? c.pack}</strong>
        </span>
        <small>{date(c.created_at)}</small>
      </Button>
    );
  }
  function tripRow(t: TripWithRole) {
    const open = expandedTrip === t.id;
    return (
      <div key={t.id} className="passport-trip-row">
        <Button
          variant="ghost"
          className="w-full h-auto min-h-14 flex items-center gap-2 px-1 text-left"
          aria-expanded={open}
          onClick={() => setExpandedTrip(open ? null : t.id)}
        >
          <TripSectionIcon trip={t} />
          <span className="min-w-0 flex-1">
            <strong className="block truncate">{tripDisplayName(t.name)}</strong>
            <small className="block truncate">
              {date(t.start_date)} · {t.destination}
            </small>
          </span>
          <span className="passport-status">{tripStatus(t)}</span>
        </Button>
        {open && (
          <div className="passport-trip-overview">
            <p>
              {t.destination} · {date(t.start_date)} – {date(t.end_date)}
            </p>
            <p>
              {t.myRole === "captain" ? "You’re the Captain" : "Your Captain leads this trip"}
              {night && t.id === activeTrip?.id
                ? ` · Next game night ${date(night)}`
                : tripStatus(t) === "Completed"
                  ? " · Memories made"
                  : ""}
            </p>
            <Button variant="ghost" className="passport-more" onClick={() => selectTrip(t.id)}>
              Open trip →
            </Button>
          </div>
        )}
      </div>
    );
  }
  return (
    <section className="passport-ag mt-4 cinematic-passport" aria-label="Passport Junkie">
      <div className="passport-leather">
        <span className="passport-corner passport-corner-top" />
        <span className="passport-corner passport-corner-bottom" />
        <div className="passport-paper passport-first-page">
          <p className="passport-folio">01 / IDENTITY</p>
          <div className="passport-cinematic-brand">
            <BrandLockup compact />
            <p className="passport-kicker">COLLECTION</p>
          </div>
          <div className="passport-rank-progress">
            <TravelerLevel userId={userId} progress />
          </div>
          <div className="passport-title-line">
            <h2>
              PASSPORT
              <br />
              JUNKIE
            </h2>
            <span aria-hidden="true">✈</span>
          </div>
          <p className="text-sm mt-2">{ROOM_COPY.passport}</p>
          <p className="passport-cinematic-subtitle">Collect your stamps</p>
          <div className="passport-identity">
            <div className="passport-photo">
              <Avatar
                url={
                  identity
                    ? identity.avatar_style === "photo"
                      ? avatarPhoto
                      : dicebearUrl(identity.avatar_style, identity.avatar_seed || userId)
                    : undefined
                }
                name={identity?.game_name ?? "Traveler"}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="passport-fields">
              <div>
                <small>✦ TRAVELER</small>
                <strong title={identity?.game_name ?? "Traveler"}>
                  {identity?.game_name ?? "Traveler"}
                </strong>
              </div>
              <div>
                <small>⌖ FROM</small>
                <strong>{identity?.hometown || "—"}</strong>
              </div>
              <label>
                <small>✧ BASED IN</small>
                <input
                  aria-label="Your home country"
                  value={home}
                  maxLength={40}
                  placeholder="Add home country"
                  onChange={(e) => setHome(e.target.value)}
                  onBlur={(e) => void saveHome(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
              </label>
              <div>
                <small>✈ TRAVEL STYLE</small>
                <strong>
                  {identity?.trip_persona
                    ? identity.trip_persona.charAt(0).toLocaleUpperCase() +
                      identity.trip_persona.slice(1)
                    : identity?.trip_persona || "Explorer"}
                </strong>
              </div>
            </div>
          </div>
          {askHome && (
            <div className="passport-confirm" role="region" aria-label="Confirm your home country">
              <p>Is your Home Country {home || guess || "set"}?</p>
              <small>It decides passport stamps abroad vs. road-trip stamps at home.</small>
              {!home && (
                <input
                  aria-label="Home country to confirm"
                  value={guess}
                  maxLength={40}
                  onChange={(e) => setGuess(e.target.value)}
                />
              )}
              <Button
                variant="ghost"
                className="passport-more mt-2"
                disabled={!(home || guess).trim()}
                onClick={() => void confirmHome(home || guess)}
              >
                Yes, that’s home
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="passport-error">
              {error}
            </p>
          )}
          <div className="passport-badges">
            <FoundingBadge userId={userId} straight />
            <TravelerLevel userId={userId} />
          </div>
          <h3 className="passport-rule-title">MY JOURNEY</h3>
          <div className="passport-stats">
            <span>
              <strong>{ink.length}</strong>
              <small>Stamps</small>
            </span>
            <span>
              <strong>{postcards.length}</strong>
              <small>Postcards</small>
            </span>
            <span>
              <strong>{countries.size}</strong>
              <small>Countries</small>
            </span>
            <Button
              variant="ghost"
              onClick={() => setCultureOpen(!cultureOpen)}
              aria-expanded={cultureOpen}
            >
              <strong>{culture.reduce((n, s) => n + s.points, 0)}</strong>
              <small>Culture Pts</small>
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Points never mix between shelves.</p>
          {cultureOpen && (
            <div className="passport-culture" role="region" aria-label="Culture stamps">
              <p>Culture Points · separate from your Season Score</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {culture.map((s) => (
                  <Button
                    key={s.card_id}
                    variant="ghost"
                    className="passport-more"
                    onClick={() => void openCulture(s)}
                  >
                    {s.title} · {s.points} pts
                  </Button>
                ))}
                {!culture.length && <span>No Culture stamps yet.</span>}
              </div>
              {layers.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <h3 className="font-display font-extrabold">
                    My culture series · {layers.length} layers
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {layers.map((s) => (
                      <span
                        key={`${s.country}-${s.culture_layer}`}
                        className="passport-stamp border border-border px-3 py-2 text-sm"
                      >
                        {s.country} ·{" "}
                        {CULTURE_LAYERS.find((l) => l.id === s.culture_layer)?.label ??
                          s.culture_layer}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {cultureError && <p role="alert">{cultureError}</p>}
              {story && (
                <div className="mt-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Close culture story"
                    onClick={() => setStory(null)}
                  >
                    <X />
                  </Button>
                  <strong className="block">{story.title}</strong>
                  <p>{story.backstory}</p>
                  <p className="whitespace-pre-line">{story.steps}</p>
                  <p>{story.meaning}</p>
                </div>
              )}
            </div>
          )}
          <h3 className="passport-rule-title">
            TRIPS · PRE-FLIGHT + TRIP SEASON CROWNS · JUNKIE RANK
          </h3>
          <h3 className="passport-rule-title">✈ PHASES</h3>
          <div className="passport-phases">
            {phases.map((phase) => (
              <Button
                key={phase.key}
                variant="ghost"
                className={`passport-phase ${phase.key === currentPhase ? "passport-phase-current" : ""}`}
                onClick={() => onNavigate?.(phase.key)}
                disabled={!onNavigate}
              >
                <img src={phase.icon} alt="" width={56} height={56} />
                <strong>{phase.name}</strong>
                <small>{phase.copy}</small>
                {phase.key === "preflight" && night && (
                  <em>
                    {new Date(night).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </em>
                )}
              </Button>
            ))}
          </div>
          <img
            className="passport-seaside"
            src={seaside}
            alt=""
            loading="lazy"
            width={1280}
            height={512}
          />
        </div>
        <div className="passport-stitch" aria-hidden="true" />
        <div className="passport-paper passport-second-page">
          <p className="passport-folio">02 / COLLECTION</p>
          <section aria-label="Stamp collection">
            <h3 className="passport-rule-title">✈ STAMP COLLECTION</h3>
            <div className="passport-stamps">
              {stamps.length ? (
                stamps.slice(0, 3).map(stamp)
              ) : (
                <Button
                  variant="ghost"
                  className="passport-visa-stamp"
                  onClick={() => setEntry("sample-stamp")}
                >
                  <span className="flex items-center gap-2">
                    <CountryFlag code={sampleCountry} />
                    <strong>{samplePlace}</strong>
                  </span>
                  <small>SAMPLE · {date(new Date().toISOString())}</small>
                </Button>
              )}
              {Array.from({ length: Math.max(0, 3 - Math.max(1, stamps.length)) }, (_, i) => (
                <span key={`empty-${i}`} className="passport-empty-stamp">
                  Next stamp
                </span>
              ))}
            </div>
            <MorePanel title="stamps" count={Math.max(0, stamps.length - 3)}>
              <div className="passport-stamps">{stamps.slice(3).map(stamp)}</div>
            </MorePanel>
          </section>
          <section aria-label="Your trips">
            <h3 className="passport-rule-title">YOUR TRIPS</h3>
            <div className="passport-trips">
              {shownTrips.length ? (
                shownTrips.slice(0, 3).map(tripRow)
              ) : (
                <Button
                  variant="ghost"
                  className="passport-sample-trip"
                  onClick={() => setEntry("sample-trip")}
                >
                  <img src={iconMap} alt="" width={22} height={22} />
                  <span>
                    Next adventure <small>Bangkok · SAMPLE</small>
                  </span>
                  <span className="passport-status">Upcoming</span>
                </Button>
              )}
            </div>
            <MorePanel title="trips" count={Math.max(0, shownTrips.length - 3)}>
              <div className="passport-trips">{shownTrips.slice(3).map(tripRow)}</div>
            </MorePanel>
          </section>
          <h3 className="passport-rule-title">AT HOME · IN-EXPERIENCE CROWNS</h3>
          <section aria-label="Postcard wall">
            <h3 className="passport-rule-title">POSTCARD WALL</h3>
            <div className="passport-board">
              <div className="passport-postcards">
                {cards.length ? (
                  cards.slice(0, 3).map(postcard)
                ) : (
                  <Button
                    variant="ghost"
                    className="passport-mini-postcard"
                    onClick={() => setEntry("sample-postcard")}
                  >
                    <span className="passport-pin" />
                    <span className="passport-postcard-photo">
                      <img src={PACKS[2].img} alt="" loading="lazy" />
                    </span>
                    <span className="flex items-center gap-1">
                      <CountryFlag code="JP" />
                      <strong>Japan at Home</strong>
                    </span>
                    <small>SAMPLE</small>
                  </Button>
                )}
              </div>
              <MorePanel title="postcards" count={Math.max(0, cards.length - 3)}>
                <div className="passport-postcards">{cards.slice(3).map(postcard)}</div>
              </MorePanel>
            </div>
          </section>
          <section aria-label="Culture stories shelf">
            <h3 className="passport-rule-title">CULTURE STORIES</h3>
            <p className="text-xs text-muted-foreground">Culture stamps · {culture.length}</p>
            <CultureBadgeRow />
            <div
              className="mt-2 rounded-md border border-border bg-muted p-3 opacity-60"
              aria-disabled="true"
            >
              <strong className="block text-sm">Bronze / Silver / Gold</strong>
              <span className="text-xs">Tiers unlock with likes and downloads · coming soon</span>
            </div>
          </section>
          {loading && (
            <p role="status" className="mt-4 text-sm">
              Opening your passport…
            </p>
          )}
          <p className="passport-closing">Collect the world with your squad.</p>
        </div>
      </div>
      {entry && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center">
          <div className="absolute inset-0 bg-foreground/70" onClick={() => setEntry(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Collection detail"
            className="passport-detail relative w-full max-w-lg p-6 pb-[max(2rem,env(safe-area-inset-bottom))]"
          >
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close detail"
              className="absolute right-4 top-4"
              onClick={() => setEntry(null)}
            >
              <X />
            </Button>
            {typeof entry === "string" ? (
              <>
                <p className="passport-kicker">SAMPLE</p>
                <h3>
                  {entry === "sample-stamp"
                    ? samplePlace
                    : entry === "sample-postcard"
                      ? "Japan at Home"
                      : "Next adventure"}
                </h3>
                <p>This is a sample — complete a trip to earn your own.</p>
              </>
            ) : (
              <>
                <p className="passport-kicker">
                  {entry.kind === "postcard" ? "POSTCARD" : "PASSPORT STAMP"}
                </p>
                <h3>
                  {entry.kind === "postcard"
                    ? (PACKS.find((p) => p.key === entry.pack)?.name ?? entry.pack)
                    : (entry.city ?? entry.state ?? entry.country)}
                </h3>
                <p>
                  {tripDisplayName(
                    trips.find((t) => t.id === entry.trip_id)?.name ??
                      (entry.kind === "postcard" ? "At Home experience" : entry.trip_name),
                  )}{" "}
                  · {date(entry.kind === "postcard" ? entry.created_at : entry.stamped_on)}
                </p>
                <p>
                  {entry.kind === "postcard"
                    ? postcardSquad === null
                      ? "A little destination to keep"
                      : `${postcardSquad} in the squad`
                    : `${entry.squad_count} in the squad`}{" "}
                  ·{" "}
                  {entry.kind === "postcard"
                    ? "At Home experience completed"
                    : "Trip completed with your squad"}
                </p>
                <Button
                  variant="ghost"
                  className="passport-more mt-4"
                  onClick={() => {
                    selectTrip(entry.trip_id);
                    setEntry(null);
                  }}
                >
                  Open trip →
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
