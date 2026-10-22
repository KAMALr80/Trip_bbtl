import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, Check, ChevronDown, Crown, Stamp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  avatarStyles,
  dicebearUrl,
  makeSeed,
  premadeAvatars,
  buddyAvatars,
  type PlayerWithAvatar,
} from "@/lib/player-cards";
import { compressImage } from "@/lib/compress-image";
import { NoAlcoholToggle } from "@/components/BetaAccess";
import {
  PERSONAS,
  charCount,
  gameNameProblem,
  nameSuggestions,
  normalizeName,
  tripRoleProblem,
} from "@/lib/game-name";

const input =
  "mt-2 w-full min-h-12 rounded-2xl border-2 border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary";
const personas = ["planner", "hype person", "photographer", "food finder", "other"];
const answers = [
  ["hometown", "Where are you from?", 160],
  ["occupation", "What do you do?", 160],
  ["fun_fact", "A fun fact nobody would guess", 300],
  ["next_year_goal", "One goal for next year", 300],
] as const;
export function Avatar({
  url,
  name,
  className = "h-12 w-12",
}: {
  url?: string | undefined;
  name: string;
  className?: string;
}) {
  return (
    <span className={`neon-avatar shrink-0 overflow-hidden grid place-items-center ${className}`}>
      {url ? (
        <img
          src={url}
          alt={`${name}'s avatar`}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="font-display text-xl font-extrabold text-foreground">
          {name[0]?.toUpperCase() || "?"}
        </span>
      )}
    </span>
  );
}
export function AvatarButton({
  userId,
  url,
  name,
  onOpen,
  className = "h-11 w-11",
  wrapperClass = "",
}: {
  userId: string;
  url?: string | undefined;
  name: string;
  onOpen?: ((id: string) => void) | undefined;
  className?: string;
  wrapperClass?: string;
}) {
  if (!onOpen) return <Avatar url={url} name={name} className={className} />;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      data-view-navigation="true"
      className={`player-avatar-button min-h-11 min-w-11 shrink-0 rounded-full p-0 ${wrapperClass}`}
      aria-label={`Open ${name}'s player card`}
      onClick={(event) => {
        event.stopPropagation();
        void import("@/lib/haptics").then(({ hapticTap }) => hapticTap());
        onOpen(userId);
      }}
    >
      <Avatar url={url} name={name} className={className} />
    </Button>
  );
}
/** Shared name + avatar row: one line with ellipsis so long names and emoji never break layouts. */
export function PlayerChip({
  url,
  name,
  sub,
  className = "",
  avatarClass = "h-10 w-10",
}: {
  url?: string | undefined;
  name: string;
  sub?: string | undefined;
  className?: string;
  avatarClass?: string;
}) {
  return (
    <span className={`flex min-w-0 items-center gap-3 ${className}`}>
      <Avatar url={url} name={name} className={avatarClass} />
      <span className="min-w-0">
        <span className="block truncate font-display font-extrabold" title={name}>
          {name}
        </span>
        {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
      </span>
    </span>
  );
}
export function RoleStamp({ role }: { role: string }) {
  return (
    <span
      className={`passport-stamp inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-extrabold uppercase ${role === "captain" ? "text-orange border-orange" : role === "co_captain" ? "text-blue border-blue" : "text-green border-green"}`}
    >
      {role === "captain" ? "Captain" : role === "co_captain" ? "Co-Captain" : "Player"}
    </span>
  );
}
type Rank = {
  tier: string;
  points: number;
  next_tier: string | null;
  next_at: number | null;
  tier_at: number;
  passport_junkie: boolean;
};
type CardFacts = {
  hometown?: string;
  occupation?: string;
  fun_fact?: string;
  most_excited?: string;
  trip_persona?: string;
  next_year_goal?: string;
};
type PlayerCardPayload = {
  game_name: string;
  avatar_style: string;
  avatar_seed: string;
  points: number;
  place?: number;
  total_people?: number;
  role?: string;
  passport?: {
    stamps: number;
    crowns: number;
    rank: Rank | null;
    badges: { founding_member?: boolean; culture_creator?: string };
    trip_postcards: { available: boolean; items: unknown[] };
  };
  facts?: CardFacts;
};
const cardRpc = supabase as unknown as {
  rpc: (
    name: string,
    args: object,
  ) => PromiseLike<{ data: PlayerCardPayload | null; error: { message: string } | null }>;
};

export function PlayerCardView({
  tripId,
  userId,
  fallback,
  initialPassport = false,
  onClose,
}: {
  tripId: string;
  userId: string;
  fallback?: PlayerWithAvatar | undefined;
  initialPassport?: boolean;
  onClose: () => void;
}) {
  const [card, setCard] = useState<PlayerCardPayload | null>(null),
    [avatar, setAvatar] = useState(fallback?.avatarUrl ?? ""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [fullFacts, setFullFacts] = useState(false),
    [passportOpen, setPassportOpen] = useState(initialPassport);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    void cardRpc
      .rpc("player_card_read", { p_trip: tripId, p_user: userId })
      .then(({ data, error: readError }) => {
        if (!live) return;
        if (readError || !data) {
          setError("This player card isn't available.");
          setLoading(false);
          return;
        }
        setCard(data);
        setAvatar(
          data.avatar_style === "photo"
            ? (fallback?.avatarUrl ?? "")
            : dicebearUrl(data.avatar_style, data.avatar_seed || userId),
        );
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [tripId, userId, fallback?.avatarUrl]);
  const facts = card?.facts
    ? [
        ["FROM", card.facts.hometown],
        ["WHAT I DO", card.facts.occupation],
        ["SECRET FUN FACT", card.facts.fun_fact],
        ["CAN'T WAIT FOR", card.facts.most_excited],
        ["MY TRIP ROLE", card.facts.trip_persona],
        ["NEXT YEAR'S GOAL", card.facts.next_year_goal],
      ]
    : [];
  const visibleFacts = facts.filter(([, value]) => value);
  const teen = !!card && !card.passport;
  const body = loading ? (
    <p role="status" className="py-16 text-center font-bold">
      Opening player card…
    </p>
  ) : error || !card ? (
    <p role="alert" className="py-16 text-center font-bold">
      {error || "This player card isn't available."}
    </p>
  ) : (
    <>
      <div className="player-passport-identity">
        <Avatar url={avatar} name={card.game_name} className="h-24 w-24 rounded-3xl" />
        <div className="min-w-0">
          <p className="player-passport-kicker">TRIPJUNKIES · PLAYER CARD</p>
          <h2 className="mt-1 break-words font-display text-3xl font-extrabold">
            {card.game_name}
          </h2>
          {card.role && (
            <div className="mt-2">
              <RoleStamp role={card.role} />
            </div>
          )}
          <p className="mt-3 font-display text-lg font-extrabold text-blue">
            {card.points} points{!teen && ` · #${card.place ?? 0} of ${card.total_people ?? 0}`}
          </p>
        </div>
      </div>
      {card.passport && (
        <section className="player-passport-section mt-5" aria-label="Passport Junkie summary">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="player-passport-kicker">PASSPORT JUNKIE</p>
              <h3 className="font-display text-xl font-extrabold">Collection</h3>
            </div>
            <BookOpen className="text-gold" />
          </div>
          <div className="player-passport-stats mt-4">
            <span>
              <Stamp />
              <strong>{card.passport.stamps}</strong>
              <small>Stamps</small>
            </span>
            <span>
              <Crown />
              <strong>{card.passport.crowns}</strong>
              <small>Crowns</small>
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {card.passport.badges.founding_member && (
              <span className="passport-stamp border-gold px-3 py-1 text-xs font-extrabold text-gold">
                Founding Member
              </span>
            )}
            {card.passport.badges.culture_creator && (
              <span className="passport-stamp border-blue px-3 py-1 text-xs font-extrabold text-blue">
                {card.passport.badges.culture_creator}
              </span>
            )}
          </div>
          <div className="mt-5 border-t border-[color:var(--passport-card-rule)] pt-4">
            <p className="font-bold">Trip Postcards</p>
            <p className="text-sm opacity-75">Coming in a later round</p>
          </div>
          <Button
            variant="outline"
            className="mt-4 min-h-11 w-full"
            onClick={() => setPassportOpen(true)}
          >
            <BookOpen /> View full Passport
          </Button>
        </section>
      )}
      {!teen && (
        <section className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-lg font-extrabold">Facts</h3>
            {visibleFacts.length > 3 && (
              <Button
                variant="outline"
                className="min-h-11 rounded-full px-4 font-bold"
                aria-expanded={fullFacts}
                onClick={() => setFullFacts((v) => !v)}
              >
                {fullFacts ? "Show less" : "See full"}
                <ChevronDown size={18} className={fullFacts ? "rotate-180" : ""} />
              </Button>
            )}
          </div>
          {visibleFacts.length ? (
            <div className="mt-3 space-y-4">
              {(fullFacts ? visibleFacts : visibleFacts.slice(0, 3)).map(([label, value]) => (
                <div key={label} className="border-b border-[color:var(--passport-card-rule)] pb-3">
                  <p className="text-[11px] font-extrabold text-muted-foreground">{label}</p>
                  <p className="mt-1 font-semibold break-words">{value}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No Facts shared yet.</p>
          )}
        </section>
      )}
    </>
  );
  if (passportOpen && card?.passport)
    return (
      <div className="fixed inset-0 z-[90] overflow-y-auto bg-background px-4 py-[max(1rem,env(safe-area-inset-top))]">
        <div className="player-passport-page mx-auto min-h-[calc(100dvh-2rem)] max-w-lg p-6">
          <Button variant="ghost" className="min-h-11" onClick={() => setPassportOpen(false)}>
            <X /> Close Passport
          </Button>
          <div className="mt-8 text-center">
            <Avatar url={avatar} name={card.game_name} className="mx-auto h-28 w-28 rounded-3xl" />
            <p className="player-passport-kicker mt-5">READ-ONLY PASSPORT</p>
            <h2 className="font-display text-4xl font-extrabold">{card.game_name}</h2>
          </div>
          <div className="player-passport-stats mt-8">
            <span>
              <Stamp />
              <strong>{card.passport.stamps}</strong>
              <small>Stamps</small>
            </span>
            <span>
              <Crown />
              <strong>{card.passport.crowns}</strong>
              <small>Crowns</small>
            </span>
          </div>
          <div className="player-passport-section mt-7">
            <h3 className="font-display text-xl font-extrabold">Badges</h3>
            <div className="mt-4 flex flex-wrap gap-3">
              {card.passport.badges.founding_member && (
                <span className="passport-stamp border-gold px-3 py-2 text-xs font-extrabold text-gold">
                  Founding Member
                </span>
              )}
              {card.passport.badges.culture_creator && (
                <span className="passport-stamp border-blue px-3 py-2 text-xs font-extrabold text-blue">
                  {card.passport.badges.culture_creator}
                </span>
              )}
              {!card.passport.badges.founding_member && !card.passport.badges.culture_creator && (
                <p className="text-sm opacity-75">No badges collected yet.</p>
              )}
            </div>
          </div>
          <div className="player-passport-section mt-7">
            <h3 className="font-display text-xl font-extrabold">Trip Postcards</h3>
            <p className="mt-2 text-sm opacity-75">Coming in a later round</p>
          </div>
        </div>
      </div>
    );
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center">
      <div
        className="absolute inset-0 bg-foreground/60"
        data-view-navigation="true"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${card?.game_name ?? fallback?.game_name ?? "Player"}'s player card`}
        className="player-passport-card relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-lg px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-7 shadow-soft"
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-5 top-5 z-10"
          aria-label="Close player card"
          data-view-navigation="true"
          onClick={onClose}
        >
          <X />
        </Button>
        {body}
      </section>
    </div>
  );
}
export type AccountProfile = {
  user_id: string;
  real_name: string;
  game_name: string;
  avatar_style: string;
  avatar_seed: string;
  avatar_path: string | null;
  hometown: string | null;
  occupation: string | null;
  fun_fact: string | null;
  trip_persona: string | null;
  next_year_goal: string | null;
  pronouns: string | null;
};
const db = supabase as unknown as { from: (t: string) => any };
const blankCard = { real_name: "-", game_name: "-", avatar_style: "street", avatar_seed: "-" };
// Curated choices only: all other seeds remain resolvable for existing player cards.
const buddyChoices = Array.from({ length: 30 }, (_, i) => 25 + i);
const travelerChoices = [...Array.from({ length: 24 }, (_, i) => 1 + i), 55, 56, 57, 58, 59, 60];

async function saveTripAnswer(
  tripId: string,
  userId: string,
  mostExcited: string,
  hasCard: boolean,
) {
  const value = mostExcited.trim() || null;
  const result = hasCard
    ? await supabase
        .from("trip_player_cards")
        .update({ most_excited: value })
        .eq("trip_id", tripId)
        .eq("user_id", userId)
    : await supabase
        .from("trip_player_cards")
        .insert({ trip_id: tripId, user_id: userId, ...blankCard, most_excited: value });
  if (result.error) throw result.error;
}

function SheetShell({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose?: (() => void) | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-foreground/50" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative max-h-[94dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-card px-6 pt-7 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-soft animate-slide-up"
      >
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-5 top-5"
            aria-label="Close"
            onClick={onClose}
          >
            <X />
          </Button>
        )}
        {children}
      </section>
    </div>
  );
}

/** One tap to join a new trip when the account profile already exists. */
export function QuickJoinCard({
  tripId,
  tripName,
  userId,
  profile,
  avatar,
  onSaved,
}: {
  tripId: string;
  tripName: string;
  userId: string;
  profile: AccountProfile;
  avatar: string;
  onSaved: () => Promise<void>;
}) {
  const [excited, setExcited] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function go() {
    setBusy(true);
    setError("");
    try {
      await saveTripAnswer(tripId, userId, excited, false);
      await onSaved();
    } catch (e) {
      console.error("Card save failed", e);
      setError("Couldn't save your card. Try again.");
      setBusy(false);
    }
  }
  return (
    <SheetShell label="Join this trip">
      <p className="text-xs font-extrabold tracking-widest text-green">NEW TRIP UNLOCKED ✳</p>
      <h2 className="mt-2 font-display text-3xl font-extrabold">You're in, {profile.game_name}!</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Your player card comes with you to <b>{tripName}</b>.
      </p>
      <div className="mt-5 flex items-center gap-4 rounded-2xl bg-blue-soft p-4">
        <Avatar url={avatar} name={profile.game_name} className="h-16 w-16 rounded-2xl" />
        <div className="min-w-0">
          <p className="font-display text-xl font-extrabold truncate">{profile.game_name}</p>
          <p className="text-xs text-ink-soft truncate">
            {[profile.hometown, profile.trip_persona].filter(Boolean).join(" · ") ||
              "Ready to play"}
          </p>
        </div>
      </div>
      <label className="mt-5 block text-sm font-bold">
        Most excited for on this trip?{" "}
        <span className="font-normal text-muted-foreground">(optional)</span>
        <input
          className={input}
          maxLength={300}
          value={excited}
          onChange={(e) => setExcited(e.target.value)}
          placeholder="The food, the beach, the late nights…"
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 text-destructive text-sm">
          {error}
        </p>
      )}
      <Button
        variant="playful"
        size="lg"
        className="mt-5 w-full"
        disabled={busy}
        onClick={() => void go()}
      >
        {busy ? "Joining…" : "Let's go!"}
        <Check />
      </Button>
    </SheetShell>
  );
}

/** Account-level profile editor (used in every trip) + this trip's "most excited" answer. */
export function PlayerCardEditor({
  tripId,
  userId,
  profile,
  current,
  onSaved,
  onClose,
}: {
  tripId: string | undefined;
  userId: string;
  profile: AccountProfile | null;
  current?: PlayerWithAvatar | undefined;
  onSaved: () => Promise<void>;
  onClose?: (() => void) | undefined;
}) {
  const base = profile ?? current;
  const [realName, setRealName] = useState(base?.real_name ?? "");
  const [gameName, setGameName] = useState(base?.game_name ?? "");
  const [style, setStyle] = useState(
    base?.avatar_style === "traveler" || base?.avatar_style === "photo"
      ? base.avatar_style
      : "traveler",
  );
  const [seed, setSeed] = useState(
    base?.avatar_style === "traveler" || base?.avatar_style === "photo"
      ? base?.avatar_seed || "1"
      : "1",
  );
  const [path] = useState(base?.avatar_path ?? null);
  const [preview, setPreview] = useState(current?.avatarUrl ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [fields, setFields] = useState({
    hometown: base?.hometown ?? "",
    occupation: base?.occupation ?? "",
    fun_fact: base?.fun_fact ?? "",
    next_year_goal: base?.next_year_goal ?? "",
    trip_persona: base?.trip_persona ?? "",
  });
  const [excited, setExcited] = useState(current?.most_excited ?? "");
  const [pronouns, setPronouns] = useState(base?.pronouns ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const initialPersona = base?.trip_persona ?? "";
  const [otherRole, setOtherRole] = useState(
    initialPersona && !(PERSONAS as readonly string[]).includes(initialPersona)
      ? initialPersona
      : "",
  );
  const [personaPick, setPersonaPick] = useState(
    initialPersona && !(PERSONAS as readonly string[]).includes(initialPersona)
      ? "other"
      : initialPersona,
  );
  const [nameStatus, setNameStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  useEffect(() => {
    const value = gameName;
    if (!value) {
      setNameStatus(null);
      return;
    }
    const local = base?.game_name === value ? null : gameNameProblem(value, true);
    if (local) {
      setNameStatus({ ok: false, msg: local });
      return;
    }
    if (base?.game_name && normalizeName(base.game_name) === normalizeName(value) && profile) {
      setNameStatus({ ok: true, msg: "✓ That's you" });
      return;
    }
    setNameStatus({ ok: false, msg: "Checking…" });
    const t = window.setTimeout(() => {
      void (
        supabase as unknown as {
          rpc: (n: string, a: object) => PromiseLike<{ data: string | null; error: unknown }>;
        }
      )
        .rpc("game_name_available", { p_name: value })
        .then(({ data, error: e }) => {
          if (e) {
            setNameStatus(null);
            return;
          }
          if (!data) setNameStatus({ ok: true, msg: "✓ Available" });
          else if (data === "TAKEN") {
            const [a, b] = nameSuggestions(value);
            setNameStatus({ ok: false, msg: `Taken — try ${a} or ${b}` });
          } else setNameStatus({ ok: false, msg: data });
        });
    }, 400);
    return () => window.clearTimeout(t);
  }, [gameName]);
  const roleProblem = personaPick === "other" ? tripRoleProblem(otherRole) : null;
  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(() => {
    if (style === "photo" && path && !preview)
      void supabase.storage
        .from("player-avatars")
        .createSignedUrl(path, 3600)
        .then(({ data }) => data && setPreview(data.signedUrl));
  }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    const nameIssue = base?.game_name === gameName ? null : gameNameProblem(gameName, true);
    if (nameIssue) {
      setError(nameIssue);
      return;
    }
    if (nameStatus && !nameStatus.ok && nameStatus.msg !== "Checking…") {
      setError(nameStatus.msg);
      return;
    }
    if (roleProblem) {
      setError(roleProblem);
      return;
    }
    setBusy(true);
    let nextPath = style === "photo" ? path : null;
    try {
      if (style === "photo" && photo) {
        const small = await compressImage(photo, 800, 200_000);
        nextPath = `account/${userId}/${crypto.randomUUID()}.${small.type === "image/webp" ? "webp" : "jpg"}`;
        const { error: uploadError } = await supabase.storage
          .from("player-avatars")
          .upload(nextPath, small, { contentType: small.type });
        if (uploadError) throw uploadError;
      }
      if (style === "photo" && !nextPath) throw new Error("Choose a photo first.");
      const persona = personaPick === "other" ? otherRole : personaPick;
      const details = {
        user_id: userId,
        real_name: realName.trim(),
        game_name: gameName,
        avatar_style: style,
        avatar_seed: seed,
        avatar_path: nextPath,
        pronouns: pronouns.trim() || null,
        ...Object.fromEntries(
          Object.entries(fields).map(([key, value]) => [key, value.trim() || null]),
        ),
        trip_persona: persona || null,
      };
      const { error: pErr } = await db
        .from("player_profiles")
        .upsert(details, { onConflict: "user_id" });
      if (pErr) throw new Error(pErr.message);
      if (tripId) await saveTripAnswer(tripId, userId, excited, !!current);
      await onSaved();
      onClose?.();
    } catch (err) {
      console.error("Card save failed", err);
      const m = (err as Error).message ?? "";
      const known =
        /^(Choose a photo first\.|That game name is taken.*|Game names .*|Trip roles .*|Remove spaces.*|Use only one space.*|Add at least one letter.*|Links aren't.*|@handles.*|That name is reserved.*|Please pick a friendlier.*|Check the spaces.*)$/.test(
          m,
        );
      setError(known ? m : "Couldn't save your card. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SheetShell label="Your player card" onClose={onClose}>
      <p className="text-xs font-extrabold tracking-widest text-green">YOUR TRAVEL ID</p>
      <h2 className="mt-2 font-display text-3xl font-extrabold">
        {profile ? "Edit your profile." : "Make your player card."}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Set it once — it's used in every trip. Your real name is only shown to people in your trips.
      </p>
      <form onSubmit={(e) => void save(e)} className="mt-6 space-y-5">
        <label className="block text-sm font-bold">
          Real name <span className="text-primary">*</span>
          <input
            className={input}
            required
            maxLength={100}
            value={realName}
            onChange={(e) => setRealName(e.target.value)}
            autoComplete="name"
          />
        </label>
        <label className="block text-sm font-bold">
          Game name <span className="text-primary">*</span>
          <input
            className={input}
            required
            maxLength={40}
            value={gameName}
            onChange={(e) => setGameName(e.target.value)}
            placeholder="What should the squad call you?"
            aria-describedby="game-name-help"
          />
          <span
            id="game-name-help"
            className="mt-1 flex justify-between gap-2 text-xs font-normal"
            aria-live="polite"
          >
            <span
              className={
                nameStatus?.ok
                  ? "text-green"
                  : nameStatus && nameStatus.msg !== "Checking…"
                    ? "text-destructive"
                    : "text-muted-foreground"
              }
            >
              {nameStatus?.msg ??
                "2–15 characters. Letters, numbers, emoji and _ . - ' ! ★ ✈ ♡ welcome."}
            </span>
            <span className="shrink-0 text-muted-foreground">{charCount(gameName)}/15</span>
          </span>
        </label>
        <p className="text-xs text-muted-foreground">
          Birthday is private and cannot be changed here. For corrections, contact{" "}
          <a className="underline" href="mailto:support@tripjunkies.app">
            support
          </a>
          .
        </p>
        <div>
          <p className="text-sm font-bold">
            Pronouns <span className="font-normal text-muted-foreground">(optional)</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {["she/her", "he/him", "they/them"].map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={pronouns === option ? "green" : "outline"}
                aria-pressed={pronouns === option}
                onClick={() => setPronouns(pronouns === option ? "" : option)}
              >
                {option}
              </Button>
            ))}
          </div>
          <input
            aria-label="Custom pronouns"
            className={input}
            maxLength={60}
            value={pronouns}
            onChange={(e) => setPronouns(e.target.value)}
            placeholder="Or type your own (leave blank to hide)"
          />
        </div>
        <div>
          <p className="text-sm font-bold">Choose your avatar</p>
          <p className="text-xs text-muted-foreground">Pick one of 54 built-in avatars.</p>
          <div className="mt-3 flex items-center gap-3">
            <Avatar
              url={style === "photo" ? preview : dicebearUrl("traveler", seed)}
              name={gameName || "You"}
              className="h-20 w-20 rounded-3xl"
            />
          </div>
          {(
            [
              { label: "Travel buddies", seeds: buddyChoices },
              { label: "Cartoon travelers", seeds: travelerChoices },
            ] as const
          ).map(({ label, seeds }) => (
            <div key={label}>
              <p className="mt-4 text-sm font-bold">{label}</p>
              <div className="mt-2 grid grid-cols-6 gap-1.5">
                {seeds.map((number, i) => {
                  const choice = String(number);
                  const url =
                    number <= 24
                      ? premadeAvatars[number - 1]
                      : number >= 55
                        ? premadeAvatars[number - 31]
                        : buddyAvatars[number - 25];
                  return (
                    <Button
                      key={choice}
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`${label} avatar ${i + 1}`}
                      aria-pressed={style === "traveler" && seed === choice}
                      className={`aspect-square h-auto w-full min-w-0 overflow-hidden rounded-xl border-2 p-0 ${style === "traveler" && seed === choice ? "border-blue" : "border-transparent"}`}
                      onClick={() => {
                        setStyle("traveler");
                        setSeed(choice);
                        setPhoto(null);
                        setPreview(url ?? "");
                      }}
                    >
                      <img
                        src={url}
                        alt=""
                        loading="lazy"
                        width={256}
                        height={256}
                        className="size-full object-cover"
                      />
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {tripId && (
          <div className="rounded-2xl bg-orange-soft p-4">
            <label className="block text-sm font-bold">
              Most excited for on this trip?{" "}
              <span className="font-normal text-ink-soft">(just this trip)</span>
              <input
                className={input}
                maxLength={300}
                value={excited}
                onChange={(e) => setExcited(e.target.value)}
              />
            </label>
          </div>
        )}
        <div className="border-t border-border pt-5">
          <p className="font-display text-lg font-extrabold">
            A little about you{" "}
            <span className="text-sm font-normal text-muted-foreground">(optional)</span>
          </p>
          <div className="mt-4 space-y-4">
            {answers.map(([key, label, limit]) => (
              <label key={key} className="block text-sm font-bold">
                {label}
                <input
                  className={input}
                  maxLength={limit}
                  value={fields[key]}
                  onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
                />
              </label>
            ))}
            <label className="block text-sm font-bold">
              Your trip role
              <select
                className={input}
                value={personaPick}
                onChange={(e) => setPersonaPick(e.target.value)}
              >
                <option value="">Pick your vibe</option>
                {personas.map((persona) => (
                  <option key={persona} value={persona}>
                    {persona[0]?.toUpperCase()}
                    {persona.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            {personaPick === "other" && (
              <label className="block text-sm font-bold">
                Your own trip role
                <input
                  className={input}
                  maxLength={30}
                  value={otherRole}
                  onChange={(e) => setOtherRole(e.target.value)}
                  placeholder="Snack scout, map master…"
                />
                <span className="mt-1 flex justify-between gap-2 text-xs font-normal">
                  <span
                    className={
                      otherRole && roleProblem ? "text-destructive" : "text-muted-foreground"
                    }
                  >
                    {otherRole && roleProblem ? roleProblem : "2–24 characters, no links."}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{charCount(otherRole)}/24</span>
                </span>
              </label>
            )}
          </div>
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <Button variant="playful" size="lg" type="submit" className="w-full" disabled={busy}>
          {busy ? "Saving..." : profile ? "Save my profile" : "I'm ready!"}
          <Check />
        </Button>
      </form>
      <NoAlcoholToggle />
    </SheetShell>
  );
}
