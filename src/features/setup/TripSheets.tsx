import { ROOM_COPY } from "@/lib/room-copy";

import { tripDisplayName } from "@/lib/trip-display-name";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Clipboard, Share2, Ticket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { Motto } from "@/features/captain-tools/RoleTips";
import { InviteCode } from "@/features/trip/InviteCode";
import { GamePlanPicker } from "@/features/setup/GamePlanPicker";
import { inviteUrl, shareInvite, type TripWithRole } from "@/lib/trips";
import { useT } from "@/i18n";
import { JoinNameField } from "@/features/trip/JoinNameField";
import { useJoinName } from "@/features/trip/use-join-name";

// Join a trip by code, or the "your trip is live" sheet. Creating a trip goes through the setup
// wizard (/trips/new, M2-05).
type Props = {
  mode: "join" | "celebrate";
  initialCode?: string;
  trip?: TripWithRole | null;
  onClose: () => void;
  onDone: (id: string) => void;
};
const field =
  "w-full h-14 rounded-2xl border-2 border-border bg-background px-4 outline-none focus:border-primary text-foreground";
export function TripSheets({ mode, initialCode = "", trip, onClose, onDone }: Props) {
  const t = useT();
  const [code, setCode] = useState(initialCode);
  const [joined, setJoined] = useState<{ id: string; name: string; destination: string } | null>(
    null,
  );
  const [preview, setPreview] = useState<{
    name: string;
    destination: string;
    motto: string | null;
  } | null>(null);
  useEffect(() => {
    if (mode !== "join" || (code.length !== 6 && code.length !== 8)) {
      setPreview(null);
      return;
    }
    let alive = true;
    void supabase
      .rpc("trip_invite_preview" as never, { p_code: code } as never)
      .then(({ data }: { data: unknown }) => {
        if (alive)
          setPreview(
            ((data as { name: string; destination: string; motto: string | null }[] | null) ??
              [])[0] ?? null,
          );
      });
    return () => {
      alive = false;
    };
  }, [code, mode]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const name = useJoinName();
  const [phase, setPhase] = useState<"plan" | "invite">("plan");
  useEffect(() => {
    setCode(initialCode);
  }, [initialCode]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [onClose]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    const result = await supabase.rpc("join_trip", {
      p_code: code.trim().toUpperCase(),
      p_display_name: name.clean,
    });
    setBusy(false);
    if (result.error) setError(friendlyError(result.error));
    else if (result.data)
      setJoined({
        id: result.data,
        name: preview?.name ?? t("tripSheets.yourTrip"),
        destination: preview?.destination ?? "",
      });
    else setError(t("tripSheets.notFound"));
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-background/80" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={mode === "join" ? t("tripSheets.joinLabel") : t("tripSheets.liveLabel")}
        className="relative w-full max-w-lg overflow-y-auto bg-card border border-border p-6 pb-[max(2rem,env(safe-area-inset-bottom))] max-h-[92dvh] rounded-t-[24px]"
      >
        <div className="w-12 h-1.5 bg-border rounded-full mx-auto mb-6" />
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-5 top-5"
          onClick={onClose}
          aria-label={t("tripSheets.close")}
        >
          <X />
        </Button>
        {joined ? (
          <div className="text-center pt-4">
            <span className="text-5xl">💌</span>
            <h2 className="font-display text-3xl font-extrabold mt-4">
              {tripDisplayName(joined.name)}
            </h2>
            <p className="text-muted-foreground mt-2">{joined.destination}</p>
            <p className="mt-5">{t("tripSheets.waitingRoom")}</p>
            <Button variant="playful" className="w-full mt-6" onClick={() => onDone(joined.id)}>
              {t("tripSheets.home")} <ArrowRight />
            </Button>
          </div>
        ) : mode === "celebrate" && trip && phase === "plan" ? (
          <>
            <span className="text-5xl">🎯</span>
            <p className="text-xs text-primary font-extrabold mt-4">{t("tripSheets.planStep")}</p>
            <h2 className="font-display font-extrabold text-3xl mt-1">
              {t("tripSheets.planTitle")}
            </h2>
            <p className="text-sm text-muted-foreground mt-2">{t("tripSheets.planIntro")}</p>
            <GamePlanPicker trip={trip} compact onSaved={() => setPhase("invite")} />
            <Button variant="ghost" className="w-full mt-3" onClick={() => setPhase("invite")}>
              {t("tripSheets.planSkip")}
            </Button>
          </>
        ) : mode === "celebrate" && trip ? (
          <div className="text-center pt-4">
            <p className="text-xs text-primary font-extrabold">{t("tripSheets.inviteStep")}</p>
            <div className="text-7xl mb-4">🎉</div>
            <p className="text-primary font-extrabold text-xs tracking-widest">
              {t("tripSheets.official")}
            </p>
            <h2 className="font-display font-extrabold text-4xl mt-2">
              {t("tripSheets.liveTitle")}
            </h2>
            <p className="font-display font-extrabold text-xl mt-3">{tripDisplayName(trip.name)}</p>
            <Motto text={(trip as { motto?: string | null }).motto} className="mt-1" />
            <p className="text-muted-foreground mt-3">{t("tripSheets.sendInvite")}</p>
            <div className="bg-pink-soft rounded-3xl p-5 mt-8">
              <p className="text-xs font-extrabold text-ink-soft">{t("tripSheets.yourCode")}</p>
              <div className="mt-3">
                <InviteCode code={trip.join_code} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteUrl(trip.join_code));
                  setCopied(true);
                }}
              >
                <Clipboard />
                {copied ? t("tripSheets.copied") : t("tripSheets.copyLink")}
              </Button>
              <Button
                variant="playful"
                onClick={async () => {
                  const status = await shareInvite(trip.join_code, trip.name);
                  if (status === "copied") setCopied(true);
                }}
              >
                <Share2 />
                {t("tripSheets.share")}
              </Button>
            </div>
            <Button variant="ghost" className="mt-5" onClick={onClose}>
              {t("tripSheets.seeTrip")} <ArrowRight />
            </Button>
          </div>
        ) : mode === "join" ? (
          <>
            <span className="text-5xl">💌</span>
            <h2 className="font-display font-extrabold text-3xl mt-3">
              {t("tripSheets.joinTitle")}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">{ROOM_COPY.join}</p>
            <form className="mt-7 space-y-4" onSubmit={(event) => void submit(event)}>
              <label className="block text-xs font-extrabold text-muted-foreground">
                {t("tripSheets.codeLabel")}
                <input
                  aria-label={t("tripSheets.codeAria")}
                  required
                  maxLength={8}
                  minLength={6}
                  pattern="[A-Za-z]{6}|[A-Za-z]{8}"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                  placeholder={t("tripSheets.codePlaceholder")}
                  autoCapitalize="characters"
                  className={`${field} mt-2 font-display text-2xl text-center tracking-widest uppercase`}
                />
              </label>
              <JoinNameField name={name} className={`${field} mt-2 font-normal text-foreground`} />
              {preview && (
                <div className="rounded-2xl bg-blue-soft p-4 text-center">
                  <p className="text-xs font-extrabold text-blue">{t("tripSheets.joining")}</p>
                  <p className="font-display font-extrabold text-xl mt-1">
                    {tripDisplayName(preview.name)}
                  </p>
                  <p className="text-sm text-muted-foreground">{preview.destination}</p>
                  <Motto text={preview.motto} className="text-sm mt-1" />
                </div>
              )}
              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
              <Button variant="playful" size="lg" className="w-full" disabled={busy || !name.valid}>
                {busy ? t("tripSheets.joinBusy") : t("tripSheets.joinButton")}
                <Ticket />
              </Button>
            </form>
          </>
        ) : null}
      </section>
    </div>
  );
}
