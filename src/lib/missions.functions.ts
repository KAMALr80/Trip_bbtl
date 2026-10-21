import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RULES } from "./content-rules";

/** "More missions": spends 2 trip AI credits (leader-checked on the server), then adds fresh safe missions for this trip only. */
export const moreMissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ tripId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as { rpc: (f: string, a: object) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
    const { data: trip } = await context.supabase.from("trips").select("destination,kind,vibe").eq("id", data.tripId).single();
    if (!trip) throw new Error("Trip not found");
    const { refundableCredits } = await import("./ai-quota.server");
    const paid = await refundableCredits(context.supabase, data.tripId, "mission_topup", context.userId);
    try {
    const { askList } = await import("./content.server");
    const home = trip.kind === "at_home" || trip.kind === "cultural_inspiration";
    const ask = home
      ? "Write 8 short Home Missions: playful airport-style reenactments at home or culture actions for this destination (greetings, food, music, clothing). Under 110 chars each."
      : "Write 8 short secret missions for travel day to this destination (ride to the airport, gate, flight, arrival). Under 110 chars each.";
    const rules = `${RULES} Never touch or joke about security rules; no touching strangers.`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: itinerary } = await supabaseAdmin.from("trip_itineraries").select("days").eq("trip_id", data.tripId).maybeSingle();
    const { data: used } = await supabaseAdmin.from("mission_claims").select("mission_text").eq("trip_id", data.tripId).limit(20);
    const fresh = (await askList(`${ask} ${rules}`, { destination: trip.destination, stops: itinerary?.days, kind: trip.kind, vibe: trip.vibe, ageTier: "clean", approved21Plus: false, rules, alreadyUsed: (used ?? []).map((r) => r.mission_text) }, data.tripId, paid)).slice(0, 8);
    if (!fresh.length) throw new Error("No missions generated. Credits returned.");
    // Client never supplies mission text: rows are written here with the service role, after the credit spend above.
    const kind = home ? "home" : "trip";
    const rows = fresh.map((t) => String(t).trim().slice(0, 200)).filter((t) => t.length > 5).slice(0, 10).map((text) => ({ kind, category: "Fresh for your trip", text, trip_id: data.tripId }));
    const { data: added, error } = await supabaseAdmin.from("security_missions").upsert(rows, { onConflict: "kind,text,trip_id", ignoreDuplicates: true }).select("id");
    if (error) throw new Error(error.message);
    return { added: added?.length ?? 0 };
    } catch (cause) { await paid.refund(); throw cause; }
  });

/** "More tasks" for Early Check-In: leader-only (checked again in add_checkin_tasks), spends 2 trip credits, refunds on failure. */
export const moreCheckinTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ tripId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: trip } = await context.supabase.from("trips").select("destination,kind,vibe").eq("id", data.tripId).single();
    if (!trip) throw new Error("Trip not found");
    const { refundableCredits } = await import("./ai-quota.server");
    const paid = await refundableCredits(context.supabase, data.tripId, "mission_topup", context.userId);
    try {
      const { askTasks } = await import("./content.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: itinerary } = await supabaseAdmin.from("trip_itineraries").select("days").eq("trip_id", data.tripId).maybeSingle();
      const { data: used } = await supabaseAdmin.from("mission_claims").select("title").eq("trip_id", data.tripId).eq("phase", "checkin").limit(30);
      const rules = `${RULES} Fun and hands-on; never use airport security agency names.`;
      const ask = `Write 8 Early Check-In tasks: hands-on culture tasks about this destination that one person does at home and presents at a group call (cook, learn, make, teach, present). Spread across food, music, dance, art, sports, language, history, business and money, traditions, etiquette, local games, geography, landmarks, how people live and work. Weave in a destination-connected film, documentary, athlete or musician when factual and relevant; add a short why about the person or place. Never record strangers. Each: title (max 6 words), what (one sentence), backstory (1-3 sentences on why it matters there), 2-4 search keywords. ${rules}`;
      const fresh = (await askTasks(ask, { destination: trip.destination, stops: itinerary?.days, kind: trip.kind, vibe: trip.vibe, ageTier: "clean", approved21Plus: false, alreadyUsed: (used ?? []).map((r) => r.title) }, paid)).slice(0, 8);
      if (!fresh.length) throw new Error("No tasks generated. Credits returned.");
      // Written with the service role after the leader check and credit spend; the client never supplies task text.
      type T = { category?: string; title?: string; what?: string; backstory?: string; keywords?: string[] };
      const rows = (fresh as T[]).filter((e) => (e.title ?? "").trim().length > 2 && (e.what ?? "").trim().length > 10).slice(0, 10).map((e) => ({
        kind: "checkin", category: (e.category?.trim() || "Fresh for your trip").slice(0, 40), title: e.title!.trim().slice(0, 80), text: e.what!.trim().slice(0, 240),
        backstory: (e.backstory ?? "").trim().slice(0, 400), keywords: (e.keywords ?? []).slice(0, 4).map((k) => String(k).trim().slice(0, 60)), trip_id: data.tripId }));
      const { data: added, error } = await supabaseAdmin.from("security_missions").upsert(rows, { onConflict: "kind,text,trip_id", ignoreDuplicates: true }).select("id");
      if (error) throw new Error(error.message);
      return { added: added?.length ?? 0 };
    } catch (cause) { await paid.refund(); throw cause; }
  });
