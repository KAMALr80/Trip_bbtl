import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/Season";
import { supabase } from "@/integrations/supabase/client";
import { checkoutBeta } from "@/lib/checkout.functions";
import type { TripWithRole } from "@/lib/trips";
import { usd, tierName, BETA_LINE } from "@/lib/prices";

export type Quote = {
  kind: string;
  label: string;
  tier: string;
  headcount: number;
  list_cents: number;
  discount_cents: number;
  discount_source: string | null;
  amount_due_cents: number;
  paid: boolean;
  upgrade_cents: number;
  order_id: string | null;
};
const db = supabase as unknown as {
  rpc: (f: string, a?: object) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
export { usd };
const discountLabel = (s: string | null) =>
  s === "captain_code"
    ? "Captain reward code"
    : s === "returning"
      ? "Returning At Home discount"
      : "Discount";

/** Order summary → free beta unlock (no card) → receipt. Every amount comes from the server quote; nothing is collected during beta. */
export function Checkout({
  trip,
  onDone,
  compact = false,
}: {
  trip: TripWithRole;
  onDone?: () => void | Promise<void>;
  compact?: boolean;
}) {
  const pay = useServerFn(checkoutBeta);
  const [q, setQ] = useState<Quote | null>(null),
    [step, setStep] = useState<"summary" | "payment" | "receipt">("summary"),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState(""),
    [burst, setBurst] = useState(0);
  const load = () =>
    db.rpc("order_quote", { p_trip: trip.id }).then((r) => {
      if (r.error) setErr(friendlyError(r.error));
      else {
        const row = (r.data as Quote[] | null)?.[0] ?? null;
        setQ(row);
        if (row?.paid) setStep("receipt");
      }
    });
  useEffect(() => {
    void load();
  }, [trip.id]);
  if (err && !q)
    return (
      <p role="alert" className="text-sm text-destructive mt-3">
        {err}
      </p>
    );
  if (!q) return <div className="mt-3 h-40 rounded-2xl bg-muted animate-pulse" aria-busy="true" />;
  const addon =
    q.upgrade_cents > 0 &&
    !q.tier.startsWith("legacy") &&
    q.tier in tierName &&
    !["1-6", "7-12", "base", "big_group"].includes(q.tier);
  const rows = (
    <div className="mt-3 space-y-2 text-sm">
      <Row k="Experience" v={q.label} />
      <Row k="Group size" v={`${tierName[q.tier] ?? q.tier} · ${q.headcount} now`} />
      {addon && <Row k="+6 seats" v={`included · ${usd(q.upgrade_cents)}`} />}
      <Row k="List price" v={usd(q.list_cents)} />
      {q.discount_cents > 0 && (
        <Row k={discountLabel(q.discount_source)} v={`−${usd(q.discount_cents)}`} accent />
      )}
      <Row k="After beta" v={usd(q.amount_due_cents)} />
      <div className="border-t border-border pt-2">
        <Row k="Due today" v={`$0.00 · ${BETA_LINE}`} bold />
      </div>
    </div>
  );

  async function confirm() {
    setBusy(true);
    setErr("");
    try {
      await pay({ data: { tripId: trip.id } });
      setBurst((b) => b + 1);
      await load();
      setStep("receipt");
      await onDone?.();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "mt-3" : "app-card mt-4"}>
      <Confetti burst={burst} />
      <div
        className="flex gap-2 text-[11px] font-extrabold tracking-widest text-muted-foreground"
        aria-label="Checkout steps"
      >
        {(["summary", "payment", "receipt"] as const).map((s, i) => (
          <span key={s} className={step === s ? "text-primary" : ""}>
            {i + 1}. {s === "summary" ? "ORDER" : s === "payment" ? "UNLOCK" : "RECEIPT"}
          </span>
        ))}
      </div>
      {step === "summary" && (
        <>
          {rows}
          <Button variant="playful" className="w-full mt-4" onClick={() => setStep("payment")}>
            Continue to free unlock
          </Button>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            One-time, never a subscription.
          </p>
        </>
      )}
      {step === "payment" && (
        <>
          <div className="mt-4 rounded-2xl bg-green-soft p-4 flex gap-3 items-start">
            <ShieldCheck className="text-green shrink-0" />
            <div>
              <p className="font-display text-lg font-extrabold">
                {BETA_LINE} — $0 today, no card needed
              </p>
              <p className="text-sm text-ink-soft mt-1">
                Nothing is charged during beta. Later, payment happens in a secure checkout window —
                never in the app.
              </p>
            </div>
          </div>
          <Button
            variant="playful"
            className="w-full mt-4"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? "Working…" : "Continue"}
          </Button>
          <Button
            variant="ghost"
            className="w-full mt-1"
            disabled={busy}
            onClick={() => setStep("summary")}
          >
            Back
          </Button>
        </>
      )}
      {step === "receipt" && (
        <>
          <p className="mt-3 font-display text-xl font-extrabold flex items-center gap-2">
            <Check className="text-green" /> {q.order_id ? "You're all set" : "Already unlocked"}
          </p>
          {q.order_id ? (
            <>
              {rows}
              <Row k="Paid today" v={`$0.00 · ${BETA_LINE}`} />
              <p className="text-xs text-muted-foreground mt-2">
                Receipt #{q.order_id.slice(0, 8).toUpperCase()}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              This one was unlocked before checkout existed — nothing to pay.
            </p>
          )}
          {q.upgrade_cents > 0 && !addon && (
            <p className="mt-3 rounded-xl bg-orange-soft p-3 text-sm">
              Your group grew past 6 — the 7–12 tier is +{usd(q.upgrade_cents)}. {BETA_LINE}.
            </p>
          )}
        </>
      )}
      {err && (
        <p role="alert" className="text-sm text-destructive mt-2">
          {err}
        </p>
      )}
    </div>
  );
}

function Row({ k, v, bold, accent }: { k: string; v: string; bold?: boolean; accent?: boolean }) {
  return (
    <div
      className={`flex justify-between gap-3 ${bold ? "font-display text-lg font-extrabold" : ""} ${accent ? "text-green font-bold" : ""}`}
    >
      <span className={bold || accent ? "" : "text-muted-foreground"}>{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
