// Captain tools → Baggage Claim tile (M5-06, R-606): the Captain or Co-Captain only breaks ties at
// the cut line or swaps one photo (once per trip), during wrap-up week.
// display-only; server: trip_private.break_postcard_tie / swap_postcard_photo.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCaptainPostcard, usePostcardRanking, type RankedPhoto } from "@/data/postcard";
import { tripPhase } from "@/features/trip/phase";
import { useT } from "@/i18n";
import { friendlyError } from "@/lib/friendly-error";
import type { TripWithRole } from "@/lib/trips";

export function PostcardCaptainTile({ trip }: { trip: TripWithRole }) {
  const t = useT();
  const open = tripPhase(trip).phase === "baggage_claim" && !trip.locked_at;
  const ranking = usePostcardRanking(trip.id, open).data ?? [];
  const act = useCaptainPostcard(trip.id);
  const [swapOut, setSwapOut] = useState<string | null>(null);
  if (trip.locked_at)
    return <p className="mt-2 text-sm text-muted-foreground">{t("postcard.captainLocked")}</p>;
  if (!open)
    return <p className="mt-2 text-sm text-muted-foreground">{t("postcard.captainLater")}</p>;
  if (!ranking.length)
    return <p className="mt-2 text-sm text-muted-foreground">{t("postcard.captainEmpty")}</p>;
  const swapUsed = ranking[0]?.swap_used ?? false;
  const kept = ranking.filter((r) => r.kept);
  const out = ranking.filter((r) => !r.kept);
  const ties = ranking.some((r) => r.tied);
  const row = (r: RankedPhoto) => (
    <li key={r.proof_id} className="flex items-center gap-3 py-2">
      {r.url ? (
        <img src={r.url} alt="" className="h-14 w-14 rounded-md object-cover" loading="lazy" />
      ) : (
        <span className="block h-14 w-14 rounded-md bg-muted" />
      )}
      <span className="flex-1 text-sm">
        {t("postcard.hearts", { count: r.hearts })}
        {r.tied && ` · ${t("postcard.tied")}`}
        {r.favored && ` · ${t("postcard.yourPick")}`}
        {r.swapped_in && ` · ${t("postcard.swappedIn")}`}
      </span>
      {r.tied && (
        <Button
          variant={r.favored ? "subtle" : "outline"}
          size="sm"
          className="min-h-11"
          disabled={act.isPending}
          onClick={() => act.mutate({ type: "tie", proofId: r.proof_id, on: !r.favored })}
        >
          {r.favored ? t("postcard.undoTie") : t("postcard.breakTie")}
        </Button>
      )}
      {!swapUsed && r.kept && (
        <Button
          variant={swapOut === r.proof_id ? "subtle" : "ghost"}
          size="sm"
          className="min-h-11"
          aria-pressed={swapOut === r.proof_id}
          onClick={() => setSwapOut(swapOut === r.proof_id ? null : r.proof_id)}
        >
          {t("postcard.swapOut")}
        </Button>
      )}
      {!swapUsed && !r.kept && swapOut && (
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={act.isPending}
          onClick={() =>
            act.mutate(
              { type: "swap", out: swapOut, in: r.proof_id },
              { onSuccess: () => setSwapOut(null) },
            )
          }
        >
          {t("postcard.swapIn")}
        </Button>
      )}
    </li>
  );
  return (
    <div className="mt-2">
      <p className="text-sm">{t("postcard.captainLine", { count: ranking[0]?.kept_count ?? 0 })}</p>
      <p className="text-xs text-muted-foreground mt-1">
        {swapUsed ? t("postcard.swapUsed") : t("postcard.swapHint")}
        {ties ? ` ${t("postcard.tieHint")}` : ""}
      </p>
      <h4 className="mt-3 text-xs font-bold uppercase">{t("postcard.onPostcard")}</h4>
      <ul className="divide-y">{kept.map(row)}</ul>
      {out.length > 0 && (
        <>
          <h4 className="mt-3 text-xs font-bold uppercase">{t("postcard.notOnPostcard")}</h4>
          <ul className="divide-y">{out.map(row)}</ul>
        </>
      )}
      {act.error && (
        <p className="text-xs text-destructive mt-2" role="alert">
          {friendlyError(act.error)}
        </p>
      )}
    </div>
  );
}
