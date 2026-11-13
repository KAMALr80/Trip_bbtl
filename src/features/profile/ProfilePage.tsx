// Passport Junkie profile (M5-10, R-701, R-714, R-715, R-722). Page 1: title (level), About me, From,
// this trip's role and "most excited for", badges. Page 2: stamps · postcards · trips; tap a stamp →
// its postcard (crew of that trip only). A private profile shows outsiders avatar, game name and
// level only; the server decides (trip_private.player_profile). No counters or rank bars (R-715).
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { usePlayerProfile, type PlayerProfile, type ProfileStamp } from "@/data/profile";
import { Avatar, RoleStamp } from "@/features/players/PlayerCards";
import { TripPostcard } from "@/features/postcard/TripPostcard";
import { useT } from "@/i18n";
import { levelFor } from "@/lib/levels";
import { placeName } from "@/lib/places";

const BADGES = ["us_explorer", "culture_collector", "storyteller"] as const;
const TIERS = ["carry_on", "carry_on", "checked_bag", "first_class"] as const;
const badgeKey = (b: string) => BADGES.find((x) => x === b);
const tierKey = (tier: number) => TIERS[Math.min(3, Math.max(1, tier))] ?? "carry_on";

export function ProfilePage({
  userId,
  tripId,
  onClose,
}: {
  userId: string;
  tripId: string | null;
  onClose?: (() => void) | undefined;
}) {
  const t = useT();
  const query = usePlayerProfile(userId, tripId);
  const [page, setPage] = useState<1 | 2>(1);
  const p = query.data;
  return (
    <div className="mx-auto max-w-lg px-[18px] py-5">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">{t("profile.eyebrow")}</p>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label={t("profile.close")}
            onClick={onClose}
          >
            <X />
          </Button>
        )}
      </div>
      {query.isPending ? (
        <p role="status" className="py-16 text-center font-bold">
          {t("profile.loading")}
        </p>
      ) : !p ? (
        <p role="alert" className="py-16 text-center font-bold">
          {t("profile.missing")}
        </p>
      ) : (
        <>
          <Identity p={p} />
          {p.private ? (
            <p className="mt-6 rounded-md bg-muted p-3 text-sm" role="note">
              {t("profile.privateNote")}
            </p>
          ) : (
            <>
              <div
                role="tablist"
                aria-label={t("profile.pages")}
                className="mt-5 grid grid-cols-2 gap-2"
              >
                {([1, 2] as const).map((n) => (
                  <Button
                    key={n}
                    role="tab"
                    aria-selected={page === n}
                    variant={page === n ? "subtle" : "ghost"}
                    className="min-h-11"
                    onClick={() => setPage(n)}
                  >
                    {n === 1 ? t("profile.page1") : t("profile.page2")}
                  </Button>
                ))}
              </div>
              {page === 1 ? <PageOne p={p} /> : <PageTwo p={p} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Identity({ p }: { p: PlayerProfile }) {
  const t = useT();
  const level = levelFor(p.countries);
  return (
    <div className="mt-2 flex items-center gap-4">
      <Avatar url={p.avatarUrl} name={p.game_name} className="h-24 w-24 rounded-3xl" />
      <div className="min-w-0">
        <h1 className="break-words font-display text-3xl font-extrabold">{p.game_name}</h1>
        <p
          className="passport-stamp mt-2 inline-flex border-blue px-3 py-1 text-xs font-extrabold uppercase text-blue"
          aria-label={`Level: ${level?.name ?? t("profile.newTraveler")}`}
        >
          ✈ {level?.name ?? t("profile.newTraveler")}
        </p>
        {p.self && (
          <p className="mt-1 text-xs text-muted-foreground">
            {p.is_public ? t("profile.youArePublic") : t("profile.youArePrivate")}
          </p>
        )}
      </div>
    </div>
  );
}

function PageOne({ p }: { p: PlayerProfile }) {
  const t = useT();
  return (
    <section className="mt-4 grid gap-3" aria-label={t("profile.page1")}>
      {p.about_me && (
        <p className="text-base" dir="auto">
          {p.about_me}
        </p>
      )}
      {p.from && (
        <p className="text-sm">
          <strong>{t("profile.from")}</strong> {p.from}
        </p>
      )}
      {p.this_trip && (
        <div className="app-card">
          <p className="text-xs font-bold uppercase text-muted-foreground">
            {t("profile.thisTrip", { trip: p.this_trip.trip_name })}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <RoleStamp role={p.this_trip.role} />
            {p.this_trip.persona && <span className="text-sm">{p.this_trip.persona}</span>}
          </div>
          {p.this_trip.most_excited && (
            <p className="mt-2 text-sm" dir="auto">
              <strong>{t("profile.excited")}</strong> {p.this_trip.most_excited}
            </p>
          )}
        </div>
      )}
      {(p.badges ?? []).length > 0 && (
        <div>
          <h2 className="font-display text-lg font-bold">{t("passport.badgesTitle")}</h2>
          <ul className="mt-1 text-sm">
            {(p.badges ?? []).flatMap((b) => {
              const key = badgeKey(b.badge);
              return key
                ? [
                    <li key={key}>
                      {t(`passport.badge.${key}`)} · {t(`passport.tier.${tierKey(b.tier)}`)}
                    </li>,
                  ]
                : [];
            })}
          </ul>
        </div>
      )}
      {!p.about_me && !p.from && !p.this_trip && !(p.badges ?? []).length && (
        <p className="text-sm text-muted-foreground">{t("profile.emptyPage1")}</p>
      )}
    </section>
  );
}

function PageTwo({ p }: { p: PlayerProfile }) {
  const t = useT();
  const [open, setOpen] = useState<ProfileStamp | null>(null);
  const stamps = (p.stamps ?? []).filter((s) => s.kind !== "postcard");
  const postcards = (p.stamps ?? []).filter((s) => s.kind === "postcard");
  const tile = (s: ProfileStamp) => (
    <li key={s.trip_id}>
      <button
        type="button"
        className="passport-stamp min-h-11 w-full p-2 text-left text-xs disabled:opacity-100"
        disabled={!s.has_postcard}
        onClick={() => setOpen(s)}
        aria-label={s.has_postcard ? t("passport.openPostcard", { trip: s.trip_name }) : undefined}
      >
        <strong className="block uppercase">
          {s.top ? "★ " : ""}
          {s.kind === "postcard"
            ? `🏠 ${placeName(s.culture ?? s.country)}`
            : (s.state ?? placeName(s.country))}
        </strong>
        <span className="block">{s.season_label}</span>
        {s.solo && <span className="block">{t("passport.solo")}</span>}
        {s.crowns.length > 0 && <span className="block">{"👑".repeat(s.crowns.length)}</span>}
        {p.self && s.hidden && (
          <span className="block text-muted-foreground">{t("profile.hiddenTag")}</span>
        )}
      </button>
    </li>
  );
  return (
    <section className="mt-4" aria-label={t("profile.page2")}>
      <h2 className="font-display text-lg font-bold">{t("profile.stamps")}</h2>
      {stamps.length ? (
        <ul className="mt-2 grid grid-cols-2 gap-2">{stamps.map(tile)}</ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{t("profile.noStamps")}</p>
      )}
      <h2 className="mt-4 font-display text-lg font-bold">{t("profile.postcards")}</h2>
      {postcards.length ? (
        <ul className="mt-2 grid grid-cols-2 gap-2">{postcards.map(tile)}</ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{t("profile.noPostcards")}</p>
      )}
      <h2 className="mt-4 font-display text-lg font-bold">{t("profile.trips")}</h2>
      {(p.stamps ?? []).length ? (
        <ul className="mt-1 text-sm">
          {(p.stamps ?? []).map((s) => (
            <li key={s.trip_id}>
              {s.trip_name} · {s.season_label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{t("profile.noTrips")}</p>
      )}
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogTitle>{open?.trip_name}</DialogTitle>
          {open && (
            <TripPostcard
              trip={{
                id: open.trip_id,
                name: open.trip_name,
                destination: open.city ?? open.country,
                start_date: open.stamped_on,
                end_date: open.stamped_on,
                cultures: open.culture ? [open.culture] : [],
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** The profile over the app (any avatar tap, R-722). */
export function ProfileSheet({
  userId,
  tripId,
  onClose,
}: {
  userId: string;
  tripId: string | null;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("profile.eyebrow")}
      className="fixed inset-0 z-50 overflow-y-auto bg-background"
    >
      <ProfilePage userId={userId} tripId={tripId} onClose={onClose} />
    </div>
  );
}
