// Me tab (M5-11, R-801, R-802, deck slide 16). Everything a player edits is here or one tap away:
// profile (name, avatar, From, About me), this trip's role and "most excited for", passport shortcuts
// (top stamps, hide a trip), public / private, notifications, Captain tools for leaders, and help,
// about, legal and account. The server checks every save.
import { useState } from "react";
import { ChevronRight, Star, EyeOff, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useMyStamps } from "@/data/postcard";
import { useMyProfilePrefs, usePlayerProfile, useProfileActions } from "@/data/profile";
import { FoundingBadge } from "@/features/onboarding/LegalConsent";
import { TravelerLevel } from "@/features/passport/PassportBook";
import { Avatar, RoleStamp } from "@/features/players/PlayerCards";
import { useT } from "@/i18n";
import { friendlyError } from "@/lib/friendly-error";
import { COUNTRIES } from "@/lib/places";
import type { PlayerWithAvatar } from "@/lib/player-cards";
import type { TripWithRole } from "@/lib/trips";

/** The phone's region as a country name (R-702: from the locale, not GPS). */
export function deviceCountry(
  languages: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages,
): string | null {
  for (const tag of languages) {
    try {
      const region = new Intl.Locale(tag).maximize().region;
      const match = region && COUNTRIES.find((c) => c.code === region);
      if (match) return match.name;
    } catch {
      // not a valid language tag; try the next one
    }
  }
  return null;
}

type Props = {
  userId: string;
  name: string;
  cards: PlayerWithAvatar[];
  active: TripWithRole | null;
  onEditCard: () => void;
  onProfile: () => void;
  onPassport: () => void;
  onNotifications: () => void;
  onCaptainTools: () => void;
  onHelp: () => void;
  onTour: () => void;
  onAbout: () => void;
  onFeedback: () => void;
  onTrips: () => void;
  onSettings: () => void;
};

export function MeHome(props: Props) {
  const t = useT();
  const { userId, name, cards, active } = props;
  const mine = cards.find((c) => c.user_id === userId);
  const leader = !!active && (active.myRole === "captain" || active.myRole === "co_captain");
  const row = (label: string, onClick: () => void, hint?: string) => (
    <Button
      variant="outline"
      className="mt-2 min-h-11 w-full justify-between bg-card"
      onClick={onClick}
    >
      <span className="text-left">
        {label}
        {hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}
      </span>
      <ChevronRight size={18} aria-hidden />
    </Button>
  );
  return (
    <div className="mt-4">
      <section className="app-card" aria-label={t("me.profileTitle")}>
        <div className="flex items-center gap-4">
          <Avatar url={mine?.avatarUrl} name={name} className="size-16" />
          <div className="min-w-0 flex-1">
            <strong className="block truncate font-display text-xl">{name}</strong>
            <span className="mt-1 flex flex-wrap items-center gap-2">
              <TravelerLevel />
              <FoundingBadge userId={userId} straight />
            </span>
            <Button variant="link" className="h-auto min-h-6 p-0 text-sm" onClick={props.onProfile}>
              {t("me.viewProfile")}
            </Button>
          </div>
          <Button variant="outline" className="min-h-11" onClick={props.onEditCard}>
            {t("me.editCard")}
          </Button>
        </div>
        <ProfileForm userId={userId} />
      </section>

      {active && mine && (
        <section className="app-card mt-4" aria-label={t("me.tripTitle")}>
          <p className="text-xs font-bold uppercase text-muted-foreground">{t("me.tripTitle")}</p>
          <p className="font-display text-lg font-extrabold">{active.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <RoleStamp role={active.myRole} />
          </div>
          <p className="mt-2 text-sm">
            <strong>{t("profile.excited")}</strong> {mine.most_excited || t("me.excitedEmpty")}
          </p>
          <Button variant="ghost" className="mt-1 min-h-11 px-0" onClick={props.onEditCard}>
            {t("me.editTrip")}
          </Button>
        </section>
      )}

      <section className="mt-4" aria-label={t("me.passportTitle")}>
        <h2 className="font-display text-lg font-extrabold">{t("me.passportTitle")}</h2>
        {row(t("me.openPassport"), props.onPassport)}
        <StampChoices />
      </section>

      <section className="mt-4" aria-label={t("me.moreTitle")}>
        <h2 className="font-display text-lg font-extrabold">{t("me.moreTitle")}</h2>
        {row(t("me.notifications"), props.onNotifications, t("me.notificationsHint"))}
        {leader && row(t("me.captainTools"), props.onCaptainTools, active?.name)}
        {row(t("me.trips"), props.onTrips)}
        {row(t("me.help"), props.onHelp)}
        {row(t("me.tour"), props.onTour)}
        {row(t("me.about"), props.onAbout)}
        {row(t("me.feedback"), props.onFeedback)}
        {row(t("me.settings"), props.onSettings, t("me.settingsHint"))}
      </section>
    </div>
  );
}

/** From (pre-filled from the phone's region the first time), About me, public / private. */
function ProfileForm({ userId }: { userId: string }) {
  const t = useT();
  const prefs = useMyProfilePrefs().data;
  const me = usePlayerProfile(userId, null).data;
  const save = useProfileActions();
  const [from, setFrom] = useState<string | null>(null);
  const [about, setAbout] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  if (!prefs || !me) return null;
  const suggested = me.from ? null : deviceCountry();
  const fromValue = from ?? me.from ?? suggested ?? "";
  const aboutValue = about ?? prefs.about_me ?? "";
  const publicValue = isPublic ?? prefs.is_public;
  const dirty = from !== null || about !== null || isPublic !== null || (!me.from && !!suggested);
  return (
    <form
      className="mt-4 grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        save.mutate(
          { type: "profile", isPublic: publicValue, about: aboutValue, from: fromValue || null },
          {
            onSuccess: () => {
              setFrom(null);
              setAbout(null);
              setIsPublic(null);
              setSaved(true);
            },
          },
        );
      }}
    >
      <label className="text-sm font-semibold">
        {t("me.from")}
        <input
          className="mt-1 block min-h-11 w-full rounded-md border bg-background px-2"
          list="me-countries"
          value={fromValue}
          maxLength={60}
          onChange={(e) => setFrom(e.target.value)}
        />
        <datalist id="me-countries">
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.name} />
          ))}
        </datalist>
        <span className="block text-xs font-normal text-muted-foreground">
          {!me.from && suggested && from === null ? t("me.fromSuggested") : t("me.fromHint")}
        </span>
      </label>
      <label className="text-sm font-semibold">
        {t("me.aboutMe")}
        <textarea
          className="mt-1 block w-full rounded-md border bg-background p-2 text-sm font-normal"
          rows={2}
          maxLength={160}
          value={aboutValue}
          onChange={(e) => setAbout(e.target.value)}
        />
      </label>
      <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold">
        <span>
          {t("me.public")}
          <span className="block text-xs font-normal text-muted-foreground">
            {publicValue ? t("me.publicOn") : t("me.publicOff")}
          </span>
        </span>
        <Switch
          checked={publicValue}
          onCheckedChange={(v) => setIsPublic(v)}
          aria-label={t("me.public")}
        />
      </label>
      <Button type="submit" className="min-h-11" disabled={!dirty || save.isPending}>
        {save.isPending ? t("me.saving") : t("me.save")}
      </Button>
      {saved && !dirty && (
        <p className="text-xs" role="status">
          {t("me.saved")}
        </p>
      )}
      {save.error && (
        <p className="text-xs text-destructive" role="alert">
          {friendlyError(save.error)}
        </p>
      )}
    </form>
  );
}

/** Pick up to 3 top stamps and hide trips from the public profile (R-801, Q28). */
function StampChoices() {
  const t = useT();
  const stamps = useMyStamps().data ?? [];
  const prefs = useMyProfilePrefs().data;
  const act = useProfileActions();
  if (!stamps.length || !prefs) return null;
  const top = prefs.top_stamps ?? [];
  const hidden = prefs.hidden_trips ?? [];
  return (
    <div className="mt-3">
      <p className="text-xs text-muted-foreground">{t("me.stampsHint")}</p>
      <ul className="mt-2 divide-y">
        {stamps.map((s) => {
          const isTop = top.includes(s.trip_id);
          const isHidden = hidden.includes(s.trip_id);
          return (
            <li key={s.trip_id} className="flex items-center gap-2 py-1">
              <span className="min-w-0 flex-1 truncate text-sm">
                {s.trip_name} · {s.season_label}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                aria-pressed={isTop}
                aria-label={t(isTop ? "me.unTop" : "me.top", { trip: s.trip_name })}
                disabled={act.isPending || (!isTop && top.length >= 3)}
                onClick={() =>
                  act.mutate({
                    type: "top",
                    trips: isTop ? top.filter((x) => x !== s.trip_id) : [...top, s.trip_id],
                  })
                }
              >
                <Star className={isTop ? "fill-current text-gold" : ""} aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                aria-pressed={isHidden}
                aria-label={t(isHidden ? "me.unhide" : "me.hide", { trip: s.trip_name })}
                disabled={act.isPending}
                onClick={() => act.mutate({ type: "hide", tripId: s.trip_id, hidden: !isHidden })}
              >
                {isHidden ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </Button>
            </li>
          );
        })}
      </ul>
      {act.error && (
        <p className="text-xs text-destructive" role="alert">
          {friendlyError(act.error)}
        </p>
      )}
    </div>
  );
}
