// "Turn on reminders" on Home (M4-07): asked after the player is in a trip, never on first visit,
// and only from a tap (browsers require that). It waits until the install card is out of the way,
// since on iPhone reminders only work in the installed app.
import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { friendlyError } from "@/lib/friendly-error";
import { safeSetItem } from "@/lib/safe-storage";
import type { TripWithRole } from "@/lib/trips";
import { useInstall } from "@/pwa/install";
import { pushState, turnOnPush, type PushState } from "@/pwa/push";

const DISMISS_KEY = "tj-reminders-dismissed";
const INSTALL_DISMISSED = "tj-install-dismissed";

const stored = (key: string) => {
  try {
    return !!window.localStorage.getItem(key);
  } catch {
    return false;
  }
};

export function RemindersCard({ trips }: { trips: readonly TripWithRole[] }) {
  const t = useT();
  const { platform, standalone } = useInstall();
  const [state, setState] = useState<PushState | null>(null);
  const [hidden, setHidden] = useState(() => stored(DISMISS_KEY));
  const [error, setError] = useState("");
  useEffect(() => {
    void pushState().then(setState);
  }, []);
  const installOutOfTheWay = standalone || platform === "none" || stored(INSTALL_DISMISSED);
  if (hidden || state !== "off" || !trips.length || !installOutOfTheWay) return null;
  if (platform === "ios" && !standalone) return null;
  return (
    <section
      data-above-home
      className="app-card mx-[18px] mb-3"
      aria-label={t("notifications.cardTitle")}
    >
      <p className="font-display text-lg font-extrabold flex items-center gap-2">
        <BellRing aria-hidden="true" className="size-5" /> {t("notifications.cardTitle")}
      </p>
      <p className="text-sm mt-1">{t("notifications.cardWhy")}</p>
      <Button
        className="mt-3 w-full min-h-11"
        onClick={async () => {
          setError("");
          try {
            setState(await turnOnPush());
          } catch (e) {
            setError(friendlyError(e));
          }
        }}
      >
        {t("notifications.cardButton")}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 min-h-11"
        onClick={() => {
          safeSetItem(DISMISS_KEY, "1");
          setHidden(true);
        }}
      >
        {t("notifications.cardNotNow")}
      </Button>
      {error && (
        <p className="text-xs text-destructive mt-2" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
