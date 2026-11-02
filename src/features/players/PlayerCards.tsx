import { useT } from "@/i18n";
import { useEffect, useState, type FormEvent } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  dicebearUrl,
  premadeAvatars,
  buddyAvatars,
  type PlayerWithAvatar,
} from "@/lib/player-cards";
import { compressImage } from "@/lib/compress-image";
import { NoAlcoholToggle } from "@/features/onboarding/BetaAccess";
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
// The deck keeps "From", the trip role and "most excited for" (R-212, R-702); occupation, fun fact
// and next-year goal are retired (L22). Their saved values are left untouched.
const answers = [["hometown", "Where are you from?", 160]] as const;
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
      aria-label={`Open ${name}'s profile`}
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
const blankCard = { real_name: "-", game_name: "-", avatar_style: "street", avatar_seed: "-" };
// Curated choices only: all other seeds remain resolvable for existing player cards.
const buddyChoices = Array.from({ length: 30 }, (_, i) => 25 + i);
const travelerChoices = [...Array.from({ length: 24 }, (_, i) => 1 + i), 55, 56, 57, 58, 59, 60];

async function saveTripAnswer(
  tripId: string,
  userId: string,
  mostExcited: string,
  hasCard: boolean,
  persona?: string,
) {
  const value = mostExcited.trim() || null;
  const role = persona === undefined ? {} : { trip_persona: persona.trim() || null };
  const result = hasCard
    ? await supabase
        .from("trip_player_cards")
        .update({ most_excited: value, ...role })
        .eq("trip_id", tripId)
        .eq("user_id", userId)
    : await supabase
        .from("trip_player_cards")
        .insert({ trip_id: tripId, user_id: userId, ...blankCard, most_excited: value, ...role });
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
  const t = useT();
  const [excited, setExcited] = useState(""),
    [persona, setPersona] = useState(profile.trip_persona ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const roles = [
    ...new Set([...PERSONAS, ...(profile.trip_persona ? [profile.trip_persona] : [])]),
  ];
  async function go() {
    setBusy(true);
    setError("");
    try {
      await saveTripAnswer(tripId, userId, excited, false, persona);
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
      {/* Joining asks two things only: role this trip (pre-filled) and most excited for (R-212). */}
      <label className="mt-5 block text-sm font-bold">
        {t("join.role")}
        <select className={input} value={persona} onChange={(e) => setPersona(e.target.value)}>
          <option value="">{t("join.noRole")}</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>
      </label>
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
      void supabase.rpc("game_name_available", { p_name: value }).then(({ data, error: e }) => {
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
      const { error: pErr } = await supabase
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
