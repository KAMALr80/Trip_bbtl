import { confirmInApp } from "@/lib/confirm";
import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as {
  rpc: (f: string, a?: object) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export const CREDIT_COST = {
  custom_game: 3,
  regen_set: 5,
  dest_activities: 3,
  team_challenges: 3,
  athome_pack: 5,
  itinerary_extra: 2,
  mission_topup: 2,
  checkin_topup: 2,
} as const;
export type CreditAction = keyof typeof CREDIT_COST;
const LABEL: Record<CreditAction, string> = {
  custom_game: "Custom game",
  regen_set: "New challenge set",
  dest_activities: "Extra destination activities",
  team_challenges: "Themed team challenges",
  athome_pack: "New At Home destination pack",
  itinerary_extra: "Extra itinerary read",
  mission_topup: "More secret missions",
  checkin_topup: "More tasks",
};

type Status = {
  included: number;
  purchased: number;
  used: number;
  remaining: number;
  itinerary_today: number;
};
export async function creditStatus(tripId: string): Promise<Status | null> {
  const r = await db.rpc("ai_credit_status", { p_trip: tripId });
  return (r.data as Status[] | null)?.[0] ?? null;
}

const EVT = "tj-out-of-credits";
export function showOutOfCredits(guest = false, message?: string) {
  window.dispatchEvent(new CustomEvent(EVT, { detail: { guest, message } }));
}
export const SOLO_WALLET_MESSAGE =
  "AI planning outside a trip uses your wallet — credit packs are coming soon. Link a trip where you're Captain or Co-Captain to use trip credits.";

/* Spend order (payments round, not built yet): the trip's included credits first, then the acting user's wallet.
   The wallet (user_credits) is written only by the server (payment webhook / founder); the app only reads it via my_credits. */
type Wallet = { trip_included: number | null; trip_remaining: number | null; wallet: number };
export function WalletLine({
  tripId,
  total,
}: {
  tripId?: string | null | undefined;
  total?: number;
}) {
  const [w, setW] = useState<Wallet | null>(null);
  useEffect(() => {
    void db
      .rpc("my_credits", { p_trip: tripId ?? null })
      .then((r) => setW((r.data as Wallet[] | null)?.[0] ?? null));
  }, [tripId]);
  if (!w) return null;
  return (
    <p className="text-sm font-bold" aria-label="Credits">
      <Sparkles className="inline -mt-0.5" size={14} />{" "}
      {tripId && w.trip_remaining != null
        ? `Trip credits ${w.trip_remaining}${total != null ? `/${total}` : ""} · `
        : ""}
      Your wallet {w.wallet}
    </p>
  );
}

/** Shows the cost and asks first; opens the out-of-credits pop-up instead when the trip can't afford it. */
export async function askCredits(tripId: string, action: CreditAction): Promise<boolean> {
  const cost = CREDIT_COST[action];
  const s = await creditStatus(tripId);
  if (!s || s.remaining < cost) {
    showOutOfCredits();
    return false;
  }
  return await confirmInApp(
    `${LABEL[action]} uses ${cost} AI credits. You have ${s.remaining} left. Continue?`,
  );
}

/** Turns a server "out of credits" refusal into the pop-up; returns the message to show otherwise. */
export function creditError(e: unknown): string {
  const m = (e as Error)?.message ?? "Something went wrong.";
  if (m.includes("OUT_OF_CREDITS") || m.includes("LEADER_ONLY")) {
    showOutOfCredits();
    return "";
  }
  return m;
}

export function CreditPacks() {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2" aria-label="Credit packs preview">
      {["Small", "Medium", "Large"].map((size) => (
        <div
          key={size}
          aria-disabled="true"
          className="rounded-md border border-border bg-muted p-2 text-center opacity-60"
        >
          <strong className="block text-xs">{size}</strong>
          <small>Coming soon</small>
        </div>
      ))}
    </div>
  );
}

/** Mounted once; the pop-up at zero credits. "Back" just closes it so they return to what they were doing. */
export function OutOfCreditsHost({ onSignIn }: { onSignIn?: () => void } = {}) {
  const [open, setOpen] = useState(false),
    [guest, setGuest] = useState(false),
    [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ guest?: boolean; message?: string }>).detail;
      setGuest(!!d?.guest || !!onSignIn);
      setMessage(d?.message ?? null);
      setOpen(true);
    };
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, [onSignIn]);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-background/80 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Out of AI credits"
    >
      <div className="app-card w-full max-w-sm relative">
        <button
          aria-label="Close"
          className="absolute right-3 top-3 text-muted-foreground"
          onClick={() => setOpen(false)}
        >
          <X size={18} />
        </button>
        <p className="eyebrow text-orange">AI CREDITS</p>
        <h2 className="font-display text-2xl font-extrabold mt-1">
          {guest ? "AI Credits Need a Profile ✨" : "You're out of AI credits ✨"}
        </h2>
        <p className="text-sm font-bold mt-2">
          {guest
            ? "Create a profile to keep unused credits — credits attach to your profile, never to a phone."
            : "Credit packs are coming soon."}
        </p>
        {!guest && message && (
          <>
            <p className="text-sm mt-2">{message}</p>
            <div className="mt-2">
              <WalletLine />
            </div>
          </>
        )}
        {!guest && !message && (
          <>
            <p className="text-sm text-muted-foreground mt-2">
              You've used today's free AI. It refills at{" "}
              {new Date(new Date().setHours(24, 0, 0, 0)).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
              .
            </p>
            <p className="text-sm mt-2">
              Only the Captain or Co-Captain can spend trip AI credits. Credit purchases are coming
              soon.
            </p>
            <div className="mt-2">
              <WalletLine />
            </div>
          </>
        )}
        <CreditPacks />
        <div className="mt-4 grid gap-2">
          {guest && onSignIn && (
            <Button
              variant="playful"
              onClick={() => {
                setOpen(false);
                onSignIn();
              }}
            >
              Sign in / Create profile
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Captain-only "AI credits left" line for the Game Day Manage area, with a gentle notice at 25%. */
export function CreditsLeft({ tripId }: { tripId: string }) {
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => {
    void creditStatus(tripId).then(setS);
  }, [tripId]);
  if (!s) return null;
  const total = s.included + s.purchased;
  const low = total > 0 && s.remaining <= total * 0.25;
  return (
    <div className="mt-3 rounded-2xl border border-border bg-card p-3" aria-label="AI credits left">
      <WalletLine tripId={tripId} total={total} />
      {total === 0 && (
        <p className="text-xs text-muted-foreground mt-1">Unlocking the trip adds AI credits.</p>
      )}
      {low && s.remaining > 0 && (
        <p className="text-xs text-orange mt-1">Running low — about a quarter left.</p>
      )}
    </div>
  );
}

type Row = {
  action: string;
  calls: number;
  credits: number;
  avg_cost_usd: number | null;
  total_cost_usd: number | null;
  avg_in: number | null;
  avg_out: number | null;
};
/** Founder-only AI cost report (last 30 days). */
export function AiCostSummary() {
  const [rows, setRows] = useState<Row[] | null>(null),
    [perTrip, setPerTrip] = useState<number | null>(null),
    [err, setErr] = useState("");
  useEffect(() => {
    void db
      .rpc("ai_cost_summary")
      .then((r) => (r.error ? setErr(friendlyError(r.error)) : setRows((r.data as Row[]) ?? [])));
    void db.rpc("ai_cost_per_trip").then((r) => setPerTrip(Number(r.data ?? 0)));
  }, []);
  const usd = (n: number | null) => `$${Number(n ?? 0).toFixed(4)}`;
  return (
    <section className="app-card mt-5" aria-label="AI cost">
      <p className="eyebrow text-blue">AI COST · LAST 30 DAYS</p>
      {err ? (
        <p className="text-sm text-destructive mt-2">{err}</p>
      ) : !rows ? (
        <p className="text-sm text-muted-foreground mt-2">Loading…</p>
      ) : (
        <>
          <p className="text-sm mt-2">
            Average per trip: <b>{usd(perTrip)}</b>
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-2">No AI calls yet.</p>
          ) : (
            <div className="mt-3 divide-y divide-border">
              {rows.map((r) => (
                <div key={r.action} className="py-2 text-sm flex justify-between gap-2">
                  <span className="font-bold">{r.action}</span>
                  <span className="text-right text-xs text-muted-foreground">
                    {r.calls} calls · {r.credits} credits · avg {usd(r.avg_cost_usd)} · total{" "}
                    {usd(r.total_cost_usd)}
                    <br />
                    avg tokens {r.avg_in ?? 0} in / {r.avg_out ?? 0} out
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Costs are estimates from token counts; older calls before tracking show no cost.
          </p>
        </>
      )}
    </section>
  );
}
