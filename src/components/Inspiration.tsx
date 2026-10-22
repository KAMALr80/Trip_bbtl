import { confirmInApp } from "@/lib/confirm";
import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compress-image";
import { useTripFeatures, ComingSoon } from "@/lib/features";
import { makeInspirationGuide } from "@/lib/inspiration.functions";
import { CountryFlag } from "@/components/CountryFlag";
import { CultureQuest } from "@/components/CultureQuest";
import type { TripWithRole } from "@/lib/trips";

import { PlacePicker } from "@/components/PlacePicker";
import { SampleCard, SampleExperienceView } from "@/components/SampleExperience";
import { ShortList } from "@/components/ShortList";
import { SAMPLE_EXPERIENCES, type SampleExperience } from "@/lib/inspiration-samples";
import { placeLabel, type Place } from "@/lib/places";
import inspirationFamily from "@/assets/inspiration-family.jpg";
import foodArt from "@/assets/inspiration-food.jpg";
import craftArt from "@/assets/inspiration-art.jpg";
import songArt from "@/assets/inspiration-song.jpg";
import languageArt from "@/assets/inspiration-language.jpg";
import traditionArt from "@/assets/inspiration-tradition.jpg";
import ideaArt from "@/assets/inspiration-idea.jpg";
import homeRoomArt from "@/assets/travel-from-home-room.webp";
import { WindowSeatView } from "@/components/WindowSeatView";
import { ROOM_COPY } from "@/lib/room-copy";
import { useLook } from "@/lib/look";
import { CultureExperiences } from "@/components/CultureExperiences";
const categoryArt: Record<string, string> = {
  Food: foodArt,
  Art: craftArt,
  Song: songArt,
  Language: languageArt,
  Tradition: traditionArt,
  "Your own idea": ideaArt,
};

const ideas = [
  {
    name: "Food",
    icon: "🍲",
    copy: "What dish is your culture famous for? Share the recipe your family swears by and the story behind it.",
  },
  {
    name: "Art",
    icon: "🎨",
    copy: "Show a craft, pattern, dress, or dance and the hands or stories that keep it alive.",
  },
  {
    name: "Song",
    icon: "🎵",
    copy: "Share a song that means something to your people: title, artist and why it matters. Link to the music app — no lyrics or audio here.",
  },
  {
    name: "Language",
    icon: "💬",
    copy: "Teach a word or phrase, how to say it, and when people use it.",
  },
  {
    name: "Tradition",
    icon: "🎭",
    copy: "Tell the squad about a holiday, ritual or custom and how you celebrate.",
  },
  {
    name: "Your own idea",
    icon: "✨",
    copy: "Anything else that carries a piece of your culture or home belongs here.",
  },
] as const;
type Category = (typeof ideas)[number]["name"];
type Card = {
  country: string | null;
  region: string | null;
  city: string | null;
  public_approved_at?: string | null;
  id: string;
  trip_id: string;
  creator_id: string;
  partner_id: string | null;
  category: Category;
  mode: "solo" | "team" | "challenge";
  title: string;
  photo_path: string | null;
  needs: string;
  backstory: string;
  steps: string;
  meaning: string;
  song_artist: string | null;
  song_url: string | null;
  reveal_on: string;
  feature_later: boolean;
  hidden_at: string | null;
  votes_revealed_at: string | null;
};
type Preview = Pick<
  Card,
  "id" | "trip_id" | "creator_id" | "partner_id" | "category" | "title" | "photo_path"
> & {
  quest_length: string;
  country: string | null;
  region: string | null;
  city: string | null;
  is_public?: boolean;
};
type Draft = Pick<
  Card,
  | "title"
  | "needs"
  | "backstory"
  | "steps"
  | "meaning"
  | "song_artist"
  | "song_url"
  | "reveal_on"
  | "feature_later"
> & { country: string; region: string; city: string };
const initial = (): Draft => ({
  title: "",
  needs: "",
  backstory: "",
  steps: "",
  meaning: "",
  song_artist: "",
  song_url: "",
  reveal_on: new Date().toLocaleDateString("en-CA"),
  feature_later: false,
  country: "",
  region: "",
  city: "",
});
const field =
  "mt-2 w-full rounded-xl border border-border bg-card p-3 text-foreground outline-none focus:border-primary";
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (n: string, a: object) => Promise<{ data: any; error: { message: string } | null }>;
};

export function Inspiration({
  trips,
  userId,
  isFounder,
  onBack,
  initialCode,
  onQuestOpened,
  room = "home",
  initialTripId,
}: {
  trips: TripWithRole[];
  userId: string;
  isFounder: boolean;
  onBack: () => void;
  initialCode?: string;
  onQuestOpened?: () => void;
  room?: "home" | "window";
  initialTripId?: string;
}) {
  const cinematic = useLook("culture") === "cinematic";
  const [category, setCategory] = useState<Category | null>(null),
    [step, setStep] = useState(0),
    [storyQuestion, setStoryQuestion] = useState(0);
  const [tripId, setTripId] = useState(initialTripId ?? trips[0]?.id ?? ""),
    [mode, setMode] = useState<"solo" | "team">("solo"),
    [partner, setPartner] = useState(""),
    [people, setPeople] = useState<{ user_id: string; display_name: string }[]>([]);
  const [draft, setDraft] = useState<Draft>(initial),
    [editing, setEditing] = useState<Card | null>(null),
    [photo, setPhoto] = useState<File | null>(null),
    [cards, setCards] = useState<Card[]>([]),
    [previews, setPreviews] = useState<Preview[]>([]),
    [selected, setSelected] = useState<Preview | null>(null),
    [names, setNames] = useState<Record<string, string>>({}),
    [votes, setVotes] = useState<{ card_id: string; voter_id: string; choice: string }[]>([]);
  const [placeDone, setPlaceDone] = useState(false),
    [pendingPlace, setPendingPlace] = useState<Place | null>(null),
    [sample, setSample] = useState<{ item: SampleExperience; side: "experience" | "show" } | null>(
      null,
    ),
    [queue, setQueue] = useState<
      {
        id: string;
        title: string;
        category: string;
        country: string | null;
        region: string | null;
        city: string | null;
        approved: boolean;
      }[]
    >([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmDelete, setConfirmDelete] = useState<string | null>(null),
    [joinedCode, setJoinedCode] = useState<string | null>(null);
  const [introSeen, setIntroSeen] = useState<boolean | null>(room === "window" ? null : true);
  const [showIntro, setShowIntro] = useState(false);
  useEffect(() => {
    if (room !== "window") return;
    let live = true;
    void supabase
      .from("profiles")
      .select("seen_tips")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error: readError }) => {
        if (live) {
          setIntroSeen(readError ? true : (data?.seen_tips ?? []).includes("window_seat_intro"));
        }
      });
    return () => {
      live = false;
    };
  }, [room, userId]);
  async function takeSeat() {
    setShowIntro(false);
    setIntroSeen(true);
    const { data } = await supabase
      .from("profiles")
      .select("seen_tips")
      .eq("id", userId)
      .maybeSingle();
    const seen = data?.seen_tips ?? [];
    if (!seen.includes("window_seat_intro"))
      await supabase
        .from("profiles")
        .update({ seen_tips: [...seen, "window_seat_intro"] })
        .eq("id", userId);
  }
  const { on } = useTripFeatures(tripId);
  const available = trips;
  async function load() {
    const ids = trips.map((t) => t.id);
    if (!ids.length) return;
    const { data } = await db
      .from("cultural_inspirations")
      .select("*")
      .in("trip_id", ids)
      .order("created_at", { ascending: false });
    const next = (data ?? []) as Card[];
    setCards(next);
    const previewsResult = await db.rpc("culture_quest_previews", {});
    const visible = (previewsResult.data ?? []) as Preview[];
    setPreviews(visible.filter((c) => ids.includes(c.trip_id)));
    const votesResult = await db
      .from("inspiration_votes")
      .select("card_id,voter_id,choice")
      .in(
        "card_id",
        next.map((c) => c.id).length
          ? next.map((c) => c.id)
          : ["00000000-0000-0000-0000-000000000000"],
      );
    setVotes(votesResult.data ?? []);
    const all = await Promise.all(ids.map((id) => supabase.rpc("trip_roster", { p_trip: id })));
    const map: Record<string, string> = {};
    all.forEach((r) =>
      (r.data ?? []).forEach((p) => {
        map[p.user_id] = p.display_name ?? "Player";
      }),
    );
    setNames(map);
    if (isFounder) {
      const qr = await db.rpc("public_inspiration_queue", {});
      setQueue(qr.data ?? []);
    }
  }
  useEffect(() => {
    void load();
  }, [trips.map((t) => t.id).join("|")]);
  useEffect(() => {
    if (!initialCode || !previews.length) return;
    void db.rpc("culture_quest", { p_action: "join", p_code: initialCode }).then((r) => {
      if (r.data) {
        const found = previews.find((c) => c.id === r.data.card);
        if (found) {
          setJoinedCode(initialCode);
          setSelected(found);
          onQuestOpened?.();
        } else setError("This quest isn't available in your squads.");
      } else if (r.error) setError(friendlyError(r.error));
    });
  }, [initialCode, previews.map((c) => c.id).join("|")]);
  useEffect(() => {
    if (!tripId) return;
    void supabase
      .rpc("trip_roster", { p_trip: tripId })
      .then(({ data }) =>
        setPeople(
          (data ?? [])
            .filter((p) => p.user_id !== userId)
            .map((p) => ({ user_id: p.user_id, display_name: p.display_name ?? "Player" })),
        ),
      );
  }, [tripId, userId]);
  const change = (key: keyof Draft, value: string | boolean) =>
    setDraft((v) => ({ ...v, [key]: value }));
  function start(c: Category) {
    setCategory(c);
    setEditing(null);
    setDraft({
      ...initial(),
      country: pendingPlace?.country ?? "",
      region: pendingPlace?.region ?? "",
      city: pendingPlace?.city ?? "",
    });
    setPlaceDone(false);
    setStep(1);
    setStoryQuestion(0);
    setError("");
    setMode("solo");
    setPartner("");
    setPhoto(null);
  }
  function edit(c: Card) {
    setCategory(c.category);
    setEditing(c);
    setTripId(c.trip_id);
    setMode(c.mode === "solo" ? "solo" : "team");
    setPartner(c.partner_id ?? "");
    setDraft({
      title: c.title,
      needs: c.needs,
      backstory: c.backstory,
      steps: c.steps,
      meaning: c.meaning,
      song_artist: c.song_artist ?? "",
      song_url: c.song_url ?? "",
      reveal_on: c.reveal_on,
      feature_later: c.feature_later,
      country: c.country ?? "",
      region: c.region ?? "",
      city: c.city ?? "",
    });
    setPlaceDone(true);
    setStep(2);
    setError("");
  }
  async function save() {
    if (
      !tripId ||
      !draft.title.trim() ||
      !draft.backstory.trim() ||
      !draft.steps.trim() ||
      !draft.meaning.trim()
    ) {
      setError("Choose a trip and add a title, backstory, steps and meaning.");
      return;
    }
    if (!draft.country) {
      setError("Choose the country this experience is from.");
      setStep(1);
      setPlaceDone(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...draft,
        region: draft.region || null,
        city: draft.city || null,
        title: draft.title.trim(),
        trip_id: tripId,
        category,
        mode,
        partner_id: mode === "solo" ? null : partner || null,
        creator_id: userId,
      };
      if (mode !== "solo" && !partner && !editing) throw new Error("Choose a squadmate first.");
      let id = editing?.id;
      if (editing) {
        const { error: e } = await db
          .from("cultural_inspirations")
          .update({
            title: payload.title,
            category,
            needs: draft.needs,
            backstory: draft.backstory,
            steps: draft.steps,
            meaning: draft.meaning,
            song_artist: draft.song_artist,
            song_url: draft.song_url,
            reveal_on: draft.reveal_on,
            feature_later: draft.feature_later,
            country: draft.country,
            region: draft.region || null,
            city: draft.city || null,
          })
          .eq("id", id);
        if (e) throw e;
      } else {
        const { data, error: e } = await db
          .from("cultural_inspirations")
          .insert(payload)
          .select("id")
          .single();
        if (e) throw e;
        id = data.id;
      }
      if (photo && id) {
        const small = await compressImage(photo);
        const ext = small.type === "image/webp" ? "webp" : "jpg";
        const path = `${id}/${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: e } = await supabase.storage
          .from("inspiration-photos")
          .upload(path, small, { contentType: small.type });
        if (e) throw e;
        const { error: ue } = await db
          .from("cultural_inspirations")
          .update({ photo_path: path })
          .eq("id", id);
        if (ue) throw ue;
      }
      setCategory(null);
      setStep(0);
      setPhoto(null);
      setPendingPlace(null);
      await load();
      if (id) {
        const saved = await db
          .from("cultural_inspirations")
          .select(
            "id,trip_id,creator_id,partner_id,category,title,photo_path,quest_length,country,region,city",
          )
          .eq("id", id)
          .single();
        if (saved.data) setSelected(saved.data as Preview);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function makeGuide() {
    if (!tripId || draft.steps.trim().length < 10) return;
    setBusy(true);
    setError("");
    try {
      const text = await makeInspirationGuide({
        data: {
          tripId,
          category: category ?? "Your own idea",
          title: draft.title || "My idea",
          notes: `What you need: ${draft.needs}\nMy notes: ${draft.steps}\nBackstory: ${draft.backstory}`,
        },
      });
      change("steps", text);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function act(cardId: string, choice: string) {
    const existing = votes.find((v) => v.card_id === cardId && v.voter_id === userId);
    const q = db.from("inspiration_votes");
    const r = existing
      ? await q.update({ choice }).eq("card_id", cardId).eq("voter_id", userId)
      : await q.insert({ card_id: cardId, voter_id: userId, choice });
    if (r.error) setError(friendlyError(r.error));
    else await load();
  }
  async function remove(c: Card) {
    setBusy(true);
    setError("");
    if (c.photo_path) {
      const storage = await supabase.storage.from("inspiration-photos").remove([c.photo_path]);
      if (storage.error) {
        setError(friendlyError(storage.error));
        setBusy(false);
        return;
      }
    }
    const r = await db.from("cultural_inspirations").delete().eq("id", c.id);
    if (r.error) setError(friendlyError(r.error));
    else {
      setConfirmDelete(null);
      await load();
    }
    setBusy(false);
  }
  const idea = ideas.find((i) => i.name === category);
  const roomName = room === "home" ? "Travel From Home" : "Window Seat";
  const roomCopy = room === "home" ? ROOM_COPY.home : ROOM_COPY.window;
  const [homeTab, setHomeTab] = useState<"experience" | "show">("experience");
  const [homeCreate, setHomeCreate] = useState(false);
  const roomSamples = (
    <>
      <h2 className="mt-7 font-display text-xl font-extrabold">Sample experiences</h2>
      <div className="culture-sample-grid">
        {SAMPLE_EXPERIENCES.map((x) => (
          <SampleCard
            key={x.id}
            sample={x}
            tile
            onOpen={() => setSample({ item: x, side: homeTab })}
          />
        ))}
      </div>
    </>
  );

  async function moderate(id: string, action: string) {
    const r = await db.rpc("moderate_inspiration", { p_card: id, p_action: action });
    if (r.error) setError(friendlyError(r.error));
    else await load();
  }
  const renderCard = (c: Preview) => {
    const full = cards.find((x) => x.id === c.id);
    const loved = votes.some(
      (v) => v.card_id === c.id && v.voter_id === userId && v.choice === "love",
    );
    return (
      <article
        key={c.id}
        className={`app-card mt-4 min-w-0 ${cinematic ? "cinematic-culture-card" : ""}`}
      >
        {cinematic && (
          <img
            src={categoryArt[c.category] || inspirationFamily}
            alt=""
            loading="lazy"
            className="cinematic-culture-thumb"
          />
        )}
        <div>
          <p className="eyebrow text-orange">
            {c.category} · CULTURE QUEST{c.is_public ? " · FEATURED" : ""}
          </p>
          <h3 className="font-display text-xl font-extrabold mt-2 break-words">{c.title}</h3>
          <p className="text-sm text-muted-foreground">
            {names[c.creator_id] ?? "A squadmate"}
            {c.partner_id ? ` · with ${names[c.partner_id] ?? "a squadmate"}` : ""}
          </p>
          {c.country && (
            <p className="text-xs text-muted-foreground mt-1">
              <CountryFlag code={c.country} /> {placeLabel(c)}
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            <Button variant="playful" className="mt-4" onClick={() => setSelected(c)}>
              Play the quest <ArrowRight size={16} />
            </Button>
            {full && (
              <Button variant="ghost" className="mt-4" onClick={() => void act(c.id, "love")}>
                {loved ? "❤️" : "💛"} {loved ? "Reacted" : "React"}
              </Button>
            )}
            {full && (c.creator_id === userId || c.partner_id === userId) && (
              <Button variant="ghost" className="mt-4" onClick={() => edit(full)}>
                Edit
              </Button>
            )}
            {full && c.creator_id === userId && (
              <Button
                variant="ghost"
                className="mt-4 text-destructive"
                onClick={() => setConfirmDelete(c.id)}
              >
                <Trash2 size={16} /> Delete
              </Button>
            )}
            {isFounder && (
              <Button variant="ghost" className="mt-4" onClick={() => void moderate(c.id, "hide")}>
                Hide (founder)
              </Button>
            )}
          </div>
          {full && confirmDelete === c.id && (
            <div className="mt-3">
              <p>Delete this experience?</p>
              <Button
                variant="ghost"
                disabled={busy}
                className="text-destructive"
                onClick={() => void remove(full)}
              >
                Yes, delete
              </Button>
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      </article>
    );
  };
  type Browse = {
    id: string;
    title: string;
    country: string | null;
    region: string | null;
    city: string | null;
    sample?: boolean;
    preview?: Preview;
    s?: SampleExperience;
  };
  const browseItems: Browse[] = [
    ...previews
      .filter((c) => c.country)
      .map((c) => ({
        id: c.id,
        title: c.title,
        country: c.country,
        region: c.region,
        city: c.city,
        preview: c,
      })),
    ...SAMPLE_EXPERIENCES.map((x) => ({
      id: x.id,
      title: x.title,
      country: x.country,
      region: x.region,
      city: x.city,
      sample: true,
      s: x,
    })),
  ];
  const placeStep = (
    <div className="mt-5 space-y-4">
      <p className="text-sm text-muted-foreground">
        Where is this experience from? Country is required; region and city are optional.
      </p>
      <PlacePicker
        value={{
          country: draft.country || null,
          region: draft.region || null,
          city: draft.city || null,
        }}
        onChange={(p) =>
          setDraft((v) => ({
            ...v,
            country: p.country ?? "",
            region: p.region ?? "",
            city: p.city ?? "",
          }))
        }
        items={browseItems}
      />
      <Button
        variant="playful"
        className="w-full"
        disabled={!draft.country}
        onClick={() => setPlaceDone(true)}
      >
        Next <ArrowRight />
      </Button>
    </div>
  );
  if (room === "window" && (introSeen === null || !introSeen || showIntro))
    return (
      <section
        className="window-seat-room window-seat-intro pb-8"
        aria-label="Window Seat introduction"
      >
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> Home
        </Button>
        <WindowSeatView />
        <div className="window-seat-intro-copy">
          <h1 className="font-display text-3xl font-extrabold">
            You've got the Window Seat.
            <br />
            Show them the view.
          </h1>
          <div className="window-seat-intro-lines">
            <p>Play daily travel challenges</p>
            <p>Learn the culture as you go</p>
            <p>Turn your trip into a guide that inspires someone's next adventure</p>
          </div>
          <Button
            variant="playful"
            size="lg"
            className="w-full mt-8"
            onClick={() => void takeSeat()}
          >
            Take your seat
          </Button>
        </div>
      </section>
    );
  if (sample)
    return (
      <div
        className={`${cinematic ? "cinematic-culture" : ""} ${room === "window" ? "window-seat-room" : "home-culture-room"}`}
      >
        <SampleExperienceView
          sample={sample.item}
          side={sample.side}
          room={room}
          backLabel={roomName}
          onBack={() => setSample(null)}
        />
      </div>
    );
  if (selected)
    return (
      <div className={room === "window" ? "window-seat-room" : ""}>
        <CultureQuest
          card={selected}
          userId={userId}
          backLabel={roomName}
          onBack={() => {
            setSelected(null);
            setJoinedCode(null);
            void load();
          }}
          {...(joinedCode ? { initialCode: joinedCode } : {})}
        />
      </div>
    );
  return (
    <section
      className={`pb-8 max-w-full overflow-x-hidden ${cinematic ? "cinematic-culture" : ""} ${room === "window" ? "window-seat-room" : "home-culture-room"}`}
    >
      {!(room === "home" && homeCreate && !category) && (
        <Button
          variant="ghost"
          onClick={() => {
            if (step) {
              setStep(0);
              setCategory(null);
            } else if (category) setCategory(null);
            else onBack();
          }}
        >
          <ArrowLeft /> {category ? roomName : "Home"}
        </Button>
      )}
      {room === "window" && (
        <>
          <WindowSeatView />
          <Button
            variant="link"
            className="window-seat-intro-link"
            onClick={() => setShowIntro(true)}
          >
            What's Window Seat?
          </Button>
        </>
      )}
      {room === "window" &&
        (() => {
          const waiting = cards.filter(
            (c) =>
              !(c as { captain_approved_at?: string | null }).captain_approved_at &&
              c.creator_id !== userId &&
              trips.find((t) => t.id === c.trip_id)?.myRole === "captain",
          );
          return (
            waiting.length > 0 && (
              <section className="app-card mt-3 border-2 border-orange">
                <h2 className="font-display font-extrabold">
                  Waiting for your OK ({waiting.length})
                </h2>
                <p className="text-xs text-muted-foreground">
                  Shared by players under 21. Your squad sees them after you approve.
                </p>
                {waiting.map((c) => (
                  <div key={c.id} className="mt-2 flex items-center gap-2">
                    <span className="flex-1 min-w-0 truncate font-bold">
                      {c.title}{" "}
                      <span className="font-normal text-muted-foreground">
                        · {names[c.creator_id] ?? "Player"}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="green"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        const r = await db.rpc("approve_inspiration", {
                          p_card: c.id,
                          p_approve: true,
                        });
                        setBusy(false);
                        if (r.error) setError(friendlyError(r.error));
                        else await load();
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        if (!(await confirmInApp(`Decline "${c.title}"?`))) return;
                        setBusy(true);
                        const r = await db.rpc("approve_inspiration", {
                          p_card: c.id,
                          p_approve: false,
                        });
                        setBusy(false);
                        if (r.error) setError(friendlyError(r.error));
                        else await load();
                      }}
                    >
                      Decline
                    </Button>
                  </div>
                ))}
              </section>
            )
          );
        })()}
      {!category ? (
        <>
          {room === "home" && (
            <img
              src={homeRoomArt}
              alt="Lamp-lit room overlooking a distant sunset skyline"
              width={1536}
              height={1024}
              sizes="(max-width: 520px) calc(100vw - 36px), 512px"
              className="window-room-art mt-3 w-full"
            />
          )}
          <h1 className="font-display text-3xl font-extrabold mt-3">{roomName}</h1>
          <p className="room-overview text-sm text-muted-foreground mt-1">{roomCopy}</p>
          {room === "home" ? (
            homeCreate ? (
              <CultureExperiences
                trips={trips}
                userId={userId}
                isFounder={isFounder}
                track="home"
                startCreating
                creationKind={homeTab === "experience" ? "explore" : "show"}
                onExitCreate={() => setHomeCreate(false)}
              />
            ) : (
              <>
                <div className="mt-5 grid gap-3">
                  <Button
                    variant="playful"
                    className="min-h-14 w-full"
                    onClick={() => {
                      setHomeTab("experience");
                      setHomeCreate(true);
                    }}
                  >
                    Experience another culture <ArrowRight size={18} />
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-14 w-full"
                    onClick={() => {
                      setHomeTab("show");
                      setHomeCreate(true);
                    }}
                  >
                    Show your culture <ArrowRight size={18} />
                  </Button>
                </div>
                <>
                  <CultureExperiences
                    trips={trips}
                    userId={userId}
                    isFounder={isFounder}
                    track="home"
                    samples={roomSamples}
                    canCreate={false}
                  />
                  <h2 className="mt-7 font-display text-xl font-extrabold">Culture Quest</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Play together with your squad.
                  </p>
                  {previews.length ? (
                    <ShortList items={previews} id="home-culture-quests">
                      {renderCard}
                    </ShortList>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Your squad's quests will appear here.
                    </p>
                  )}
                  <h2 className="mt-8 font-display text-xl font-extrabold">Make a Culture Quest</h2>
                  <div className="grid gap-3 mt-3">
                    {ideas.map((i) => (
                      <Button
                        key={i.name}
                        variant="outline"
                        className="min-h-14 text-left"
                        onClick={() => {
                          setCategory(i.name);
                          setStep(0);
                        }}
                      >
                        {i.icon} {i.name}
                      </Button>
                    ))}
                  </div>
                </>
              </>
            )
          ) : (
            <>
              <CultureExperiences
                trips={trips}
                userId={userId}
                isFounder={isFounder}
                track="travel"
                initialTripId={initialTripId}
                creationKind="inspire"
              />
            </>
          )}
          {isFounder && room === "window" && (
            <section className="app-card mt-8">
              <h2 className="font-display text-lg font-extrabold">
                Feature publicly · founder review
              </h2>
              {queue.length ? (
                <ShortList items={queue} id="inspiration-review">
                  {(x) => (
                    <div key={x.id} className="mt-3 border-t border-border pt-3 min-w-0">
                      <p className="font-bold break-words">{x.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {x.category}
                        {x.country ? ` · ${placeLabel(x)}` : ""} ·{" "}
                        {x.approved ? "Public" : "Waiting"}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        <Button
                          size="sm"
                          variant={x.approved ? "outline" : "green"}
                          onClick={() => void moderate(x.id, x.approved ? "unapprove" : "approve")}
                        >
                          {x.approved ? "Unapprove" : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => void moderate(x.id, "hide")}
                        >
                          Hide
                        </Button>
                      </div>
                    </div>
                  )}
                </ShortList>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No requests right now.</p>
              )}
            </section>
          )}
        </>
      ) : step === 0 ? (
        <>
          <div className="cinematic-frame mt-3 rounded-3xl">
            <img
              src={categoryArt[category] ?? inspirationFamily}
              alt={`${category} illustration`}
              width={992}
              height={672}
              loading="lazy"
              className="w-full h-auto object-contain"
            />
          </div>
          <p className="eyebrow mt-4 text-orange">
            {roomName} · {idea?.icon} {category}
          </p>
          <h1 className="font-display text-3xl font-extrabold mt-2">{category}</h1>
          <p className="room-overview text-sm text-muted-foreground mt-1">{roomCopy}</p>
          <p className="mt-3 text-lg">{idea?.copy}</p>
          <Button
            variant="playful"
            size="lg"
            className="w-full mt-8"
            onClick={() => start(category)}
          >
            Start experience <ArrowRight />
          </Button>
        </>
      ) : (
        <>
          <p className="eyebrow text-blue mt-5">
            {editing ? "EDIT EXPERIENCE" : `STEP ${step} OF 4`}
          </p>
          <div className="h-1 bg-muted rounded-full mt-3">
            <div className="h-full bg-primary rounded-full" style={{ width: `${step * 25}%` }} />
          </div>
          <h1 className="font-display text-xl font-extrabold mt-5">
            {step === 1 && !placeDone
              ? "Where is it from?"
              : ["", "Your crew", "The story", "Make it followable", "The reveal"][step]}
          </h1>
          <p className="room-overview text-sm text-muted-foreground mt-1">{roomCopy}</p>
          {step === 1 && !placeDone ? (
            placeStep
          ) : step === 1 ? (
            <div className="space-y-4 mt-5">
              <label className="block font-bold">
                Your trip
                <select
                  value={tripId}
                  onChange={(e) => setTripId(e.target.value)}
                  className={field}
                >
                  {available.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              {tripId && !on("inspiration") ? (
                <ComingSoon title={roomName} />
              ) : (
                <>
                  <div className="flex gap-2">
                    {(["solo", "team"] as const).map((m) => (
                      <Button
                        key={m}
                        variant={mode === m ? "playful" : "outline"}
                        className="capitalize"
                        onClick={() => setMode(m)}
                      >
                        {m === "team" ? "Team up" : "Solo"}
                      </Button>
                    ))}
                  </div>
                  {mode !== "solo" && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Build one experience together.
                      </p>
                      <label className="block font-bold">
                        Squadmate
                        <select
                          className={field}
                          value={partner}
                          onChange={(e) => setPartner(e.target.value)}
                        >
                          <option value="">Choose a squadmate</option>
                          {people.map((p) => (
                            <option key={p.user_id} value={p.user_id}>
                              {p.display_name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  <Button
                    variant="playful"
                    className="w-full"
                    disabled={!tripId || (mode !== "solo" && !partner)}
                    onClick={() => setStep(2)}
                  >
                    Next <ArrowRight />
                  </Button>
                </>
              )}
            </div>
          ) : step === 2 ? (
            <div className="mt-5 min-w-0">
              <p className="text-xs text-blue font-extrabold">
                STORY CARD {storyQuestion + 1} OF {category === "Song" ? 8 : 6}
              </p>
              {(() => {
                const questions = [
                  "title",
                  "needs",
                  "backstory",
                  "steps",
                  "meaning",
                  ...(category === "Song" ? ["song_artist", "song_url"] : []),
                  "photo",
                ] as const;
                const k: (typeof questions)[number] = questions[storyQuestion] ?? "title";
                const labels: Record<string, string> = {
                  title: "What is your experience called?",
                  needs: "What will someone need?",
                  backstory: "What's the story behind it?",
                  steps: "How can someone try it?",
                  meaning: "What does it mean to you?",
                  song_artist: "Who is the artist?",
                  song_url: "Music link (optional)",
                  photo: "Add a photo (optional)",
                };
                return (
                  <label className="block mt-4 font-bold min-w-0">
                    {labels[k]}
                    {k === "photo" ? (
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className={field}
                        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                      />
                    ) : k === "title" || k === "song_artist" || k === "song_url" ? (
                      <input
                        className={field}
                        type={k === "song_url" ? "url" : "text"}
                        maxLength={k === "song_url" ? 500 : 120}
                        value={String(draft[k as keyof Draft] ?? "")}
                        onChange={(e) => change(k as keyof Draft, e.target.value)}
                      />
                    ) : (
                      <textarea
                        className={field}
                        rows={4}
                        maxLength={k === "steps" ? 5000 : 2000}
                        value={String(draft[k as keyof Draft] ?? "")}
                        onChange={(e) => change(k as keyof Draft, e.target.value)}
                      />
                    )}
                  </label>
                );
              })()}
              <Button
                variant="playful"
                className="mt-5 w-full"
                onClick={() => {
                  const last = category === "Song" ? 7 : 5;
                  if (storyQuestion < last) setStoryQuestion(storyQuestion + 1);
                  else setStep(3);
                }}
              >
                Next <ArrowRight />
              </Button>
              {storyQuestion > 0 && (
                <Button
                  variant="ghost"
                  className="mt-2"
                  onClick={() => setStoryQuestion(storyQuestion - 1)}
                >
                  <ArrowLeft /> Previous question
                </Button>
              )}
            </div>
          ) : step === 3 ? (
            <div className="mt-5">
              <p className="text-sm text-muted-foreground">
                Your own words stay yours. Review any suggested steps before saving.
              </p>
              <Button
                variant="outline"
                className="w-full mt-4"
                disabled={busy || draft.steps.trim().length < 10}
                onClick={() => void makeGuide()}
              >
                <Sparkles size={18} /> Make it followable · 2 AI credits
              </Button>
              <textarea
                aria-label="Editable steps"
                className={`${field} mt-4`}
                rows={8}
                maxLength={5000}
                value={draft.steps}
                onChange={(e) => change("steps", e.target.value)}
              />
              <Button variant="playful" className="w-full mt-4" onClick={() => setStep(4)}>
                Next <ArrowRight />
              </Button>
            </div>
          ) : (
            <div className="space-y-4 mt-5">
              <label className="block font-bold">
                Reveal date
                <input
                  type="date"
                  className={field}
                  value={draft.reveal_on}
                  onChange={(e) => change("reveal_on", e.target.value)}
                />
              </label>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={draft.feature_later}
                  onChange={(e) => change("feature_later", e.target.checked)}
                />{" "}
                Feature publicly (shows to everyone after founder approval)
              </label>
              <p className="text-sm text-muted-foreground">
                Your squad sees it when the date arrives. Featured experiences reach everyone only
                after founder approval.
              </p>
              <Button
                variant="playful"
                className="w-full"
                disabled={busy}
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Save experience"}
              </Button>
            </div>
          )}
          {step > 1 && (
            <Button variant="ghost" className="mt-3" onClick={() => setStep(step - 1)}>
              <ArrowLeft /> Back
            </Button>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-destructive mt-3">
          {error}
        </p>
      )}
    </section>
  );
}
