import { tripDisplayName } from "@/lib/trip-display-name";
import { Destinations } from "./ExperiencePreviews";
import { useLook } from "@/lib/look";
import { confirmInApp } from "@/lib/confirm";
import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useState } from "react";
import { ArrowLeft, Ban, Check, Flag, Trophy, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountryFlag } from "@/components/CountryFlag";
import { PlaceBrowser, type PlaceItem } from "@/components/PlaceBrowser";
import { supabase } from "@/integrations/supabase/client";
import { ShortList } from "@/components/ShortList";
import { PublicStamp, type PublicStampData } from "@/components/PublicStamp";
import { placeLabel } from "@/lib/places";
import { PlacePicker } from "@/components/PlacePicker";
import type { TripWithRole } from "@/lib/trips";

const db = supabase as unknown as {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type Room = PlaceItem & {
  nickname: string;
  nights: number;
  ended: boolean;
  crowns: string[];
  leaders: { name: string; score: number; stamp?: PublicStampData | null }[];
  isMember: boolean;
  requested: boolean;
  questions: string[];
  highlights: string[];
};

type RoomRow = {
  trip_id: string;
  nickname: string;
  country: string;
  region: string | null;
  city: string | null;
  nights_played: number;
  ended: boolean;
  crowns: string[] | null;
  leaders: Room["leaders"] | null;
  is_member: boolean;
  requested: boolean;
};

const SAMPLE_ROOMS: Room[] = [
  {
    id: "sample-midnight",
    sample: true,
    title: "The Midnight Crew",
    nickname: "The Midnight Crew",
    country: "MX",
    region: null,
    city: "Mexico City",
    nights: 9,
    ended: false,
    crowns: [],
    isMember: false,
    requested: false,
    leaders: [
      { name: "Mango", score: 98 },
      { name: "Orbit", score: 91 },
      { name: "Sunset", score: 84 },
      { name: "Compass", score: 76 },
      { name: "Luna", score: 68 },
    ],
    questions: [
      "What snack would you smuggle onto any flight?",
      "Which song makes you dance in the kitchen?",
    ],
    highlights: ["🏆 Won Taste the City", "✈️ Final Call Night crowned"],
  },
  {
    id: "sample-redrock",
    sample: true,
    title: "Red Rock Rollers",
    nickname: "Red Rock Rollers",
    country: "US",
    region: "Arizona",
    city: "Sedona",
    nights: 7,
    ended: false,
    crowns: [],
    isMember: false,
    requested: false,
    leaders: [
      { name: "Cactus", score: 95 },
      { name: "Dusty", score: 88 },
      { name: "Vortex", score: 81 },
      { name: "Sage", score: 77 },
      { name: "Canyon", score: 70 },
    ],
    questions: [
      "Sunrise hike or sunset hike — and who's carrying the snacks?",
      "What's the best road-trip song of all time?",
      "What would your desert nickname be?",
    ],
    highlights: ["🌵 Won Two Truths in the Desert", "🎤 Best singer three weeks running"],
  },
  {
    id: "sample-fjord",
    sample: true,
    title: "Fjord Squad",
    nickname: "Fjord Squad",
    country: "NO",
    region: "Vestland",
    city: "Bergen",
    nights: 12,
    ended: true,
    crowns: ["game", "trip"],
    isMember: false,
    requested: false,
    leaders: [
      { name: "Viking", score: 97 },
      { name: "Aurora", score: 93 },
      { name: "Puffin", score: 86 },
    ],
    questions: [
      "Would you rather swim in a fjord or sleep under the northern lights?",
      "What's a cozy tradition from your family?",
    ],
    highlights: ["✈️ Final Call Night crowned", "🌴 Trip Season crowned in Bergen"],
  },
];

const crownName = (c: string) => (c === "trip" ? "Trip Season" : "Pre-Flight");

function LocationChip({ room }: { room: Pick<Room, "country" | "region" | "city"> }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
      {room.country && (
        <CountryFlag code={room.country} className="inline-block h-3 w-[18px] shrink-0" />
      )}
      <span className="truncate">{placeLabel(room)}</span>
    </span>
  );
}

export function GameRoomsPage({
  onBack,
  onSampleNight,
  onEnterCode,
  onOpenTrip,
  isFounder,
  onStartTrip,
  onTryAtHome,
  onOpenCulture,
}: {
  onBack: () => void;
  onSampleNight: () => void;
  onEnterCode: () => void;
  onOpenTrip: (id: string) => void;
  isFounder?: boolean | undefined;
  onStartTrip?: (destination: string) => void;
  onTryAtHome?: (pack: string) => void;
  onOpenCulture?: () => void;
}) {
  const [tab, setTab] = useState<"rooms" | "destinations">("rooms");
  const cinematic = useLook("squad") === "cinematic";
  const [real, setReal] = useState<Room[]>([]);
  const [adult, setAdult] = useState(false),
    [teen, setTeen] = useState(false);
  useEffect(() => {
    void supabase.rpc("my_access").then(({ data }) => {
      const r = (data as { age_range: string }[] | null)?.[0]?.age_range;
      setAdult(r === "21+");
      setTeen(r === "Teen 13–17");
    });
  }, []);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = () =>
    void db.rpc("game_rooms").then(({ data }) => {
      setReal(
        ((data as RoomRow[] | null) ?? []).map((r) => ({
          id: r.trip_id,
          title: r.nickname,
          nickname: r.nickname,
          country: r.country,
          region: r.region,
          city: r.city,
          nights: r.nights_played,
          ended: r.ended,
          crowns: r.crowns ?? [],
          leaders: r.leaders ?? [],
          isMember: r.is_member,
          requested: r.requested,
          questions: [],
          highlights: [],
        })),
      );
    });
  useEffect(load, []);
  const rooms = [...real, ...SAMPLE_ROOMS];
  const destinations = (
    <Destinations
      isFounder={isFounder}
      {...(onStartTrip && !teen ? { onStartTrip } : {})}
      {...(onTryAtHome && !teen ? { onTryAtHome } : {})}
      {...(onOpenCulture ? { onOpenCulture } : {})}
    />
  );
  const tabs = (
    <div className="av-phase-tabs mt-5" role="tablist" aria-label="Leaderboards sections">
      {(teen
        ? [["destinations", "Destinations"]]
        : [
            ["rooms", "Game Rooms"],
            ["destinations", "Destinations"],
          ]
      ).map(([k, label]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={(teen ? "destinations" : tab) === k}
          className={`av-phase-tab ${(teen ? "destinations" : tab) === k ? "av-phase-active" : ""}`}
          onClick={() => setTab(k as "rooms" | "destinations")}
        >
          {label}
        </button>
      ))}
    </div>
  );
  // Teens see Destinations only; the Game Rooms / public leaderboard tab stays adult-only.
  if (teen)
    return (
      <section className="min-w-0 pb-8">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> Home
        </Button>
        <h1 className="mt-5 font-display text-3xl font-extrabold">Leaderboards</h1>
        {tabs}
        <p className="mt-3 text-xs text-muted-foreground">Game Rooms are for adults 18+.</p>
        {destinations}
      </section>
    );
  if (tab === "destinations")
    return (
      <section className={`min-w-0 pb-8 ${cinematic ? "cinematic-rooms" : ""}`}>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> Home
        </Button>
        <h1 className="mt-5 font-display text-3xl font-extrabold">Leaderboards</h1>
        {tabs}
        {destinations}
      </section>
    );
  const room = rooms.find((r) => r.id === openId);
  if (room)
    return (
      <RoomOverview
        room={room}
        adult={adult}
        onBack={() => setOpenId(null)}
        onSampleNight={onSampleNight}
        onEnterCode={onEnterCode}
        onOpenTrip={onOpenTrip}
        onRequested={load}
      />
    );
  const row = (r: Room) => (
    <Button
      key={r.id}
      variant="ghost"
      onClick={() => setOpenId(r.id)}
      className={`app-card mt-3 flex w-full h-auto min-w-0 items-center justify-between gap-3 p-4 text-left ${cinematic ? "cinematic-room-row" : ""}`}
    >
      <span className="min-w-0">
        <span className="block truncate font-display text-lg font-extrabold">{r.nickname}</span>
        <span className="mt-1 flex flex-wrap gap-1.5">
          <LocationChip room={r} />
          {r.sample && (
            <span className="rounded-full bg-orange/15 px-2 py-0.5 text-xs font-bold text-orange">
              Sample
            </span>
          )}
          {r.ended && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold">Highlights</span>
          )}
        </span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{r.nights} nights</span>
    </Button>
  );
  return (
    <section className={`min-w-0 pb-8 ${cinematic ? "cinematic-rooms" : ""}`}>
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft /> Home
      </Button>
      {cinematic ? (
        <div className="cinematic-season-heading mt-5">
          <p className="eyebrow text-gold">Who's ready to be crowned?</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold">Leaderboards</h1>
          <p className="mt-2 text-sm">
            A global game community. Connect, compete, and travel together.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-5 font-display text-xl font-extrabold text-gold">
            Who's ready to be crowned?
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold">Leaderboards</h1>
          <p className="mt-2 text-muted-foreground">
            See squads competing in other cities and countries. Only squads whose Captain opts in
            appear here.
          </p>
        </>
      )}
      {tabs}
      <h2 className="mt-6 font-display text-xl font-extrabold">
        {cinematic ? "Game Rooms" : "All rooms"}
      </h2>
      {real.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          No real squads listed yet — here are a few samples.
        </p>
      )}
      <ShortList items={rooms} id="room-browse" limit={cinematic ? 5 : 3} scrollPanel={cinematic}>
        {row}
      </ShortList>
      <PlaceBrowser
        items={rooms}
        noun="room"
        headline="Rooms by place"
        renderItem={row}
        renderEmpty={() => <p className="text-sm text-muted-foreground">No rooms here yet.</p>}
      />
    </section>
  );
}

function RoomOverview({
  room,
  adult,
  onBack,
  onSampleNight,
  onEnterCode,
  onOpenTrip,
  onRequested,
}: {
  room: Room;
  adult: boolean;
  onBack: () => void;
  onSampleNight: () => void;
  onEnterCode: () => void;
  onOpenTrip: (id: string) => void;
  onRequested: () => void;
}) {
  const [asking, setAsking] = useState(false),
    [interest, setInterest] = useState(""),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(""),
    [err, setErr] = useState("");
  const questions = room.questions.length
    ? room.questions
    : [
        "What's one thing on your travel bucket list?",
        "Would you rather plan every minute or wing the whole trip?",
        "What's a food from home you'd share with this squad?",
      ];
  async function request() {
    setBusy(true);
    setErr("");
    const { error } = await db.rpc("request_room", { p_trip: room.id, p_interest: interest });
    setBusy(false);
    if (error) setErr(friendlyError(error));
    else {
      setMsg("Request sent ✨ The Captain has 3 days to answer.");
      setAsking(false);
      onRequested();
    }
  }
  return (
    <section className="min-w-0 pb-8">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft /> Game Rooms
      </Button>
      <article className="app-card mt-5 min-w-0">
        <p className="eyebrow text-orange">
          {room.sample
            ? "SAMPLE · NOT A REAL SQUAD"
            : room.ended
              ? "HIGHLIGHTS · TRIP ENDED"
              : "GAME ROOM"}
        </p>
        <h1 className="mt-2 break-words font-display text-2xl font-extrabold">{room.nickname}</h1>
        <div className="mt-2">
          <LocationChip room={room} />
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm">
          <Users size={16} /> {room.nights} game night{room.nights === 1 ? "" : "s"} played
        </p>
        {room.crowns.length > 0 && (
          <p className="mt-1 flex items-center gap-2 text-sm">
            <Trophy size={16} className="text-orange" /> {room.crowns.map(crownName).join(" · ")}{" "}
            crowned
          </p>
        )}
        <h2 className="mt-6 font-bold">{room.ended ? "Top 3" : "Pre-Flight leaderboard"}</h2>
        <ol className="mt-2 space-y-1">
          <ShortList
            items={room.leaders.slice(0, room.ended ? 3 : 5)}
            id={`room-leaders-${room.id}`}
          >
            {(l, i) => (
              <li
                key={`${l.name}-${i}`}
                className="flex justify-between gap-3 border-b border-border py-2"
              >
                <span className="min-w-0 flex items-center">
                  <span className="truncate">
                    {i + 1}. {l.name}
                  </span>
                  <PublicStamp stamp={l.stamp} />
                </span>
                <strong className="shrink-0">{l.score}</strong>
              </li>
            )}
          </ShortList>
          {!room.leaders.length && (
            <li className="text-sm text-muted-foreground">
              Scores appear after the first game night.
            </li>
          )}
        </ol>
        {!room.ended && (
          <>
            <h2 className="mt-5 font-bold">Cards they play</h2>
            <ul className="mt-2 space-y-2">
              {questions.slice(0, 3).map((q) => (
                <li key={q} className="rounded-xl bg-muted px-3 py-2 text-sm">
                  “{q}”
                </li>
              ))}
            </ul>
          </>
        )}
        {room.highlights.length > 0 && (
          <>
            <h2 className="mt-5 font-bold">Highlights</h2>
            {room.highlights.map((h) => (
              <p key={h} className="mt-1 text-sm">
                {h}
              </p>
            ))}
          </>
        )}
        {room.ended && room.isMember && (
          <Button variant="playful" className="mt-6 w-full" onClick={() => onOpenTrip(room.id)}>
            📸 Open our photos & recap
          </Button>
        )}
        {!room.ended && (
          <Button variant="playful" className="mt-6 w-full" onClick={onSampleNight}>
            🎬 Watch a sample night
          </Button>
        )}
        {!room.ended && !room.isMember && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={onEnterCode}>
              Enter code
            </Button>
            {adult ? (
              <Button
                variant="outline"
                disabled={room.sample || room.requested || !!msg}
                onClick={() => setAsking(true)}
              >
                {room.requested ? "Requested" : "Request to join"}
              </Button>
            ) : (
              <span className="self-center text-xs text-muted-foreground">
                Requests are 21+ · samples are open to everyone
              </span>
            )}
          </div>
        )}
        {room.sample && !room.ended && (
          <p className="mt-2 text-xs text-muted-foreground">Sample rooms can't take requests.</p>
        )}
        {room.isMember && !room.ended && (
          <Button variant="outline" className="mt-3 w-full" onClick={() => onOpenTrip(room.id)}>
            Open my trip
          </Button>
        )}
        {asking && (
          <div className="mt-4 rounded-xl border border-border p-3">
            <label className="text-sm font-bold" htmlFor="room-interest">
              Why this squad? (optional)
            </label>
            <input
              id="room-interest"
              maxLength={80}
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              placeholder="e.g. Dreaming of Thailand"
              className="mt-2 min-h-11 w-full rounded-full border border-border bg-card px-3"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              The Captain sees your game name, home city, this note, your level, stamps and Founding
              Member badge — nothing else. If approved, you join as a normal member. 21+ only.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="playful"
                className="flex-1"
                disabled={busy}
                onClick={() => void request()}
              >
                {busy ? "Sending…" : "Send request"}
              </Button>
              <Button variant="ghost" onClick={() => setAsking(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {msg && (
          <p className="mt-3 text-sm text-green" role="status">
            {msg}
          </p>
        )}
        {err && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {err}
          </p>
        )}
      </article>
    </section>
  );
}

/** Captain-only listing switch (off by default). */
export function RoomListingSettings({
  trip,
  onSaved,
}: {
  trip: TripWithRole;
  onSaved: () => Promise<void> | void;
}) {
  const t = trip as TripWithRole & {
    room_listed?: boolean;
    room_nickname?: string | null;
    room_country?: string | null;
    room_region?: string | null;
    room_city?: string | null;
  };
  const [listed, setListed] = useState(!!t.room_listed),
    [nick, setNick] = useState(t.room_nickname ?? tripDisplayName(trip.name));
  const [country, setCountry] = useState(t.room_country ?? ""),
    [region, setRegion] = useState(t.room_region ?? ""),
    [city, setCity] = useState(t.room_city ?? "");
  const [busy, setBusy] = useState(false),
    [note, setNote] = useState(""),
    [err, setErr] = useState("");
  async function save() {
    setBusy(true);
    setErr("");
    setNote("");
    const { error } = await db.rpc("set_room_listing", {
      p_trip: trip.id,
      p_listed: listed,
      p_nickname: nick,
      p_country: country || null,
      p_region: region,
      p_city: city,
    });
    setBusy(false);
    if (error) setErr(friendlyError(error));
    else {
      setNote(listed ? "Listed in Game Rooms ✓" : "Not listed ✓");
      await onSaved();
    }
  }
  const field = "mt-1 min-h-11 w-full rounded-xl border border-border bg-card px-3 text-foreground";
  return (
    <div className="min-w-0 space-y-3">
      <label className="flex items-center justify-between gap-3">
        <span>
          <strong className="block">List this squad in Game Rooms</strong>
          <small className="text-muted-foreground">
            Others see the nickname, place and nights played. Each player chooses whether they show
            on public leaderboards in Me → Settings.
          </small>
        </span>
        <input
          type="checkbox"
          className="size-6 shrink-0 accent-primary"
          checked={listed}
          onChange={(e) => setListed(e.target.checked)}
        />
      </label>
      <label className="block text-sm font-bold">
        Room nickname
        <input
          className={field}
          maxLength={40}
          value={nick}
          onChange={(e) => setNick(e.target.value)}
        />
      </label>
      <PlacePicker
        value={{ country: country || null, region: region || null, city: city || null }}
        onChange={(p) => {
          setCountry(p.country ?? "");
          setRegion(p.region ?? "");
          setCity(p.city ?? "");
        }}
        items={SAMPLE_ROOMS}
      />
      <Button variant="playful" className="w-full" disabled={busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Save listing"}
      </Button>
      {note && (
        <p className="text-sm text-green" role="status">
          {note}
        </p>
      )}
      {err && (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

type Req = {
  id: string;
  name: string;
  home_city: string | null;
  interest: string | null;
  level: number;
  stamps: number;
  founding: boolean;
  expires_at: string;
};

export function useRoomRequests(tripId: string | undefined, leader: boolean) {
  const [items, setItems] = useState<Req[]>([]);
  const load = () => {
    if (!tripId || !leader) {
      setItems([]);
      return;
    }
    void db
      .rpc("room_requests_for", { p_trip: tripId })
      .then(({ data }) => setItems((data as Req[] | null) ?? []));
  };
  useEffect(load, [tripId, leader]);
  return { items, reload: load };
}

/** Captain / Co-Captain inbox for Game Room join requests. */
export function RoomRequests({ tripId, onChanged }: { tripId: string; onChanged?: () => void }) {
  const { items, reload } = useRoomRequests(tripId, true);
  const [err, setErr] = useState(""),
    [busy, setBusy] = useState<string | null>(null);
  async function act(id: string, action: string, ask?: string) {
    if (ask && !(await confirmInApp(ask))) return;
    const note = action === "report" ? (window.prompt("What happened? (optional)") ?? "") : null;
    setBusy(id);
    setErr("");
    const { error } = await db.rpc("decide_room_request", {
      p_request: id,
      p_action: action,
      p_note: note,
    });
    setBusy(null);
    if (error) setErr(friendlyError(error));
    else {
      if (action === "report") setErr("Report sent. Urgent? Email safety@tripjunkies.app");
      reload();
      onChanged?.();
    }
  }
  if (!items.length)
    return <p className="text-sm text-muted-foreground">No join requests right now.</p>;
  return (
    <div className="space-y-3">
      <ShortList items={items} id={`room-requests-${tripId}`}>
        {(r) => (
          <div key={r.id} className="rounded-xl border border-border p-3">
            <p className="font-bold">
              {r.name}{" "}
              {r.founding && (
                <span className="ml-1 rounded-full bg-orange/15 px-2 py-0.5 text-xs text-orange">
                  Founding Member
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {[r.home_city, `Level ${r.level}`, `${r.stamps} stamps`].filter(Boolean).join(" · ")}
            </p>
            {r.interest && <p className="mt-1 text-sm">“{r.interest}”</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="green"
                disabled={busy === r.id}
                onClick={() => void act(r.id, "approve")}
              >
                <Check /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === r.id}
                onClick={() => void act(r.id, "decline")}
              >
                <X /> Decline
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === r.id}
                onClick={() =>
                  void act(
                    r.id,
                    "block",
                    `Block ${r.name}? They won't be able to request this room again.`,
                  )
                }
              >
                <Ban /> Block
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === r.id}
                onClick={() => void act(r.id, "report")}
              >
                <Flag /> Report
              </Button>
            </div>
          </div>
        )}
      </ShortList>
      <p className="text-xs text-muted-foreground">
        Requests expire after 3 days. Urgent? Email safety@tripjunkies.app
      </p>
      {err && (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
