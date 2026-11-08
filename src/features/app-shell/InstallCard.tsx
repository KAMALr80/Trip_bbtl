// "Install TripJunkies" on Home (M4-01): the browser's own prompt where there is one, an
// Add to Home Screen guide on iPhone Safari. Offered once the player is in a trip, again in the
// days before their next trip, and never in the installed app. It never blocks play.
import { Download, Share } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { safeSetItem } from "@/lib/safe-storage";
import type { TripWithRole } from "@/lib/trips";
import { shouldOfferInstall } from "@/pwa/install-rules";
import { useInstall } from "@/pwa/install";

const DISMISS_KEY = "tj-install-dismissed";

function dismissedAt(): number | null {
  try {
    const value = Number(window.localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** The next trip's first day (local midnight), today's trip included. */
function nextTripStart(trips: readonly TripWithRole[], now: number): number | null {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const starts = trips
    .map((t) => new Date(`${t.start_date}T00:00:00`).getTime())
    .filter((s) => Number.isFinite(s) && s >= today.getTime())
    .sort((a, b) => a - b);
  return starts[0] ?? null;
}

export function InstallCard({ trips }: { trips: readonly TripWithRole[] }) {
  const t = useT();
  const { platform, standalone, prompt } = useInstall();
  const [hidden, setHidden] = useState(false);
  const now = Date.now();
  if (
    hidden ||
    !shouldOfferInstall({
      platform,
      standalone,
      inATrip: trips.length > 0,
      dismissedAt: dismissedAt(),
      nextTripStart: nextTripStart(trips, now),
      now,
    })
  )
    return null;
  const notNow = () => {
    safeSetItem(DISMISS_KEY, String(Date.now()));
    setHidden(true);
  };
  return (
    <section data-above-home className="app-card mx-[18px] mb-3" aria-label={t("install.title")}>
      <p className="font-display text-lg font-extrabold">{t("install.title")}</p>
      <p className="text-sm mt-1">{t("install.why")}</p>
      {platform === "ios" ? (
        <p className="text-sm mt-2 flex items-center gap-1 flex-wrap">
          {t("install.iosStep1")}
          <Share aria-hidden="true" className="size-4" />
          {t("install.iosStep2")}
        </p>
      ) : (
        <Button
          className="mt-3 w-full min-h-11"
          onClick={async () => {
            if (await prompt()) setHidden(true);
          }}
        >
          <Download aria-hidden="true" /> {t("install.button")}
        </Button>
      )}
      <Button variant="ghost" size="sm" className="mt-2 min-h-11" onClick={notNow}>
        {t("install.notNow")}
      </Button>
    </section>
  );
}
