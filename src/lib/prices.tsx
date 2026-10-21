import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** List prices come only from the server price list (public.price_rules). Never hardcode amounts in the UI. */
export type PriceRow = { key: string; label: string; cents: number; beta_free: boolean };
const db = supabase as unknown as {
  rpc: (f: string, a?: object) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
let cache: Promise<PriceRow[]> | null = null;
export const loadPrices = () =>
  (cache ??= Promise.resolve(db.rpc("price_list")).then(
    (r) => (r.data as PriceRow[] | null) ?? [],
  ));
export const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export function usePrices() {
  const [rows, setRows] = useState<PriceRow[] | null>(null);
  useEffect(() => {
    let on = true;
    void loadPrices().then((r) => {
      if (on) setRows(r);
    });
    return () => {
      on = false;
    };
  }, []);
  const map = Object.fromEntries((rows ?? []).map((r) => [r.key, r.cents])) as Record<
    string,
    number
  >;
  return {
    rows,
    cents: (k: string) => map[k],
    betaFree: rows ? (rows[0]?.beta_free ?? true) : true,
    ready: !!rows,
  };
}

/** Shared tier names used by setup, quotes and receipts. */
export const tierName: Record<string, string> = {
  window_solo: "Solo",
  window_crew: "Crew up to 4",
  culture_base: "Up to 6 people",
  trip_d5: "Up to 6 · up to 5 days",
  trip_d10: "Up to 6 · 6–10 days",
  trip_d15: "Up to 6 · 11–15 days",
  trip_d16: "Up to 6 · 16+ days",
  "1-6": "1–6 people",
  "7-12": "7–12 people",
  big_group: "21–30 people (Big Group)",
  base: "Up to 20 people",
};

export const BETA_LINE = "Free during beta";

/** One-line list price for a room type, read from the server price list. */
export function RoomPriceNote({ room }: { room: "window" | "culture" | "trip" | "home_legacy" }) {
  const { cents, ready } = usePrices();
  if (!ready) return null;
  const parts =
    room === "window"
      ? [`Solo ${usd(cents("window_solo") ?? 0)}`, `crew up to 4 ${usd(cents("window_crew") ?? 0)}`]
      : room === "culture"
        ? [
            `Up to 6 ${usd(cents("culture_base") ?? 0)}`,
            `+6 seats ${usd(cents("culture_addon") ?? 0)}`,
          ]
        : room === "home_legacy"
          ? [
              `1–6 people ${usd(cents("legacy_home_6") ?? 0)}`,
              `7–12 ${usd(cents("legacy_home_12") ?? 0)}`,
            ]
          : [
              `Up to 6: ${usd(cents("trip_d5") ?? 0)} up to 5 days`,
              `${usd(cents("trip_d10") ?? 0)} 6–10`,
              `${usd(cents("trip_d15") ?? 0)} 11–15`,
              `${usd(cents("trip_d16") ?? 0)} 16+`,
              `+6 seats ${usd(cents("trip_addon") ?? 0)}`,
            ];
  return (
    <p className="mt-4 rounded-xl bg-orange-soft p-3 text-sm">
      <strong>{BETA_LINE}.</strong> Later, one-time: {parts.join(" · ")}. No card needed.
    </p>
  );
}
