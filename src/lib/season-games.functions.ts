import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EXPLORER_SQUARES, findItPool, SPEED_CHALLENGES } from "./trip-games";
import type { ItineraryDay } from "./itinerary";

export type SeasonGameKind = "bingo" | "scavenger" | "speed";
/** Day 1 Bingo → Day 2 Scavenger → Day 3 Speed → repeat, counted from the trip's first day. */
export function seasonGameFor(start: string, date: string): SeasonGameKind {
  const n = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 864e5);
  return (["bingo", "scavenger", "speed"] as const)[((n % 3) + 3) % 3]!;
}
const COUNT: Record<SeasonGameKind, number> = { bingo: 9, scavenger: 5, speed: 1 };
const KIND: Record<SeasonGameKind, string> = { bingo: "season_bingo", scavenger: "season_find", speed: "season_speed" };

export const prepareSeasonGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ tripId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase.from("trip_members").select("role").eq("trip_id", data.tripId).eq("user_id", context.userId).eq("status", "approved").maybeSingle();
    if (!member) throw new Error("Join this trip first.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin.from("trip_season_games" as never).select("id").eq("trip_id", data.tripId).eq("day_date", data.date).maybeSingle();
    if (existing) return { ok: true };
    const { data: trip } = await supabaseAdmin.from("trips").select("*").eq("id", data.tripId).single();
    if (!trip || trip.kind !== "trip" || trip.season_scoring === false || trip.play_arrangement === "offline") return { ok: false };
    if (data.date < trip.start_date || data.date > trip.end_date) return { ok: false };
    const { data: today } = await supabaseAdmin.rpc("trip_today" as never, { p_trip: data.tripId } as never);
    const leader = member.role === "captain" || member.role === "co_captain";
    if (!leader && String(today) !== data.date) throw new Error("Games unlock on the day.");
    const { data: plan } = await supabaseAdmin.from("trip_itineraries").select("days").eq("trip_id", data.tripId).maybeSingle();
    const days = (Array.isArray(plan?.days) ? plan.days : []) as ItineraryDay[];
    const city = days.find((d) => d.date === data.date)?.city || trip.destination;
    const game = seasonGameFor(trip.start_date, data.date);
    const n = COUNT[game];
    const nr = await import("./content.server");
    const admin = supabaseAdmin as unknown as Parameters<typeof nr.seenSets>[0];
    const seen = await nr.seenSets(admin, data.tripId, KIND[game]);
    const teen = !!trip.has_minors;
    // City-tailored first (app-paid, cost-guarded); falls back to the written pools.
    const ask = game === "bingo" ? `Write ${n} short bingo squares (under 70 chars) for a group exploring ${city} today.` : game === "scavenger" ? `Write ${n} quick photo scavenger finds (under 120 chars) in public places of ${city}.` : `Write ${n} one-photo speed challenge (under 120 chars) a squad can finish within 60 minutes in ${city}.`;
    const ai = (await nr.askList(`${ask} Vibe: ${teen ? "Family" : trip.vibe ?? "Chill"}.${teen ? " Teens present: Family-only, no alcohol." : ""}`, { city, destination: trip.destination }, data.tripId, undefined, context.userId)).filter((t) => !seen.trip.has(nr.keyOf(t)));
    const pool = game === "bingo" ? EXPLORER_SQUARES : game === "scavenger" ? findItPool(false) : SPEED_CHALLENGES;
    const tasks = (ai.length >= n ? ai.slice(0, n) : nr.pickUnseen(pool, seen, n)).map((t) => t.replaceAll("{city}", city));
    await nr.markSeen(admin, data.tripId, KIND[game], tasks);
    await supabaseAdmin.from("trip_season_games" as never).upsert({ trip_id: data.tripId, day_date: data.date, game, city, tasks, speed_minutes: game === "speed" ? 60 : null } as never, { onConflict: "trip_id,day_date", ignoreDuplicates: true } as never);
    return { ok: true };
  });
