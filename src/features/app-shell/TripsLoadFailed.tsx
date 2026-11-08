// Shown instead of "No trips just yet" when the trip list couldn't load (QA-16): an empty list and
// a failed load are different things, and only one of them means starting a trip.
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

export function TripsLoadFailed({ offline, onRetry }: { offline: boolean; onRetry: () => void }) {
  const t = useT();
  return (
    <section role="alert" className="app-card mt-4 text-center">
      <h2 className="font-display text-xl font-extrabold">{t("trips.loadFailedTitle")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {offline ? t("trips.loadFailedOffline") : t("trips.loadFailedLine")}
      </p>
      <Button className="mt-4 min-h-11" onClick={onRetry}>
        {t("trips.retry")}
      </Button>
    </section>
  );
}
