import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RULES, safeContent } from "./content-rules";
import { EXPLORER_SQUARES, PHOTO_THEMES, SECRET_MISSIONS, FIND_IT_KINDS, FIND_IT_SAFETY, findItPool, dayTag, seededShuffle } from "./trip-games";
import type { DayTags, ItineraryDay } from "./itinerary";

type Trivia = { q: string; options: string[]; answer: number };
type AiOut = { bingo?: string[]; quests?: string[]; trivia?: Trivia[] };

function todayIn(tz: string) { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch { return new Date().toISOString().slice(0, 10); } }

async function askAi(payload: object, want: { bingo: boolean; quests: boolean; trivia: boolean }, log: (m: string, u: { inputTokens?: number | undefined; outputTokens?: number | undefined } | undefined) => Promise<void>): Promise<AiOut> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key || (!want.bingo && !want.quests && !want.trivia)) return {};
  const { createOpenAI } = await import("@ai-sdk/openai");
  const { streamText } = await import("ai");
  const provider = createOpenAI({ baseURL: "https://ai.gateway.lovable.dev/v1", apiKey: key, headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" } });
  const shape = [want.bingo && '"bingo": 9 short bingo squares (under 70 chars)', want.quests && `"quests": 3 Find It tasks (under 120 chars), each starting with a different hunt kind from: ${FIND_IT_KINDS.join(", ")}; use Landmark Quest only if a world-famous landmark is verified in today's itinerary city`, want.trivia && '"trivia": 6 multiple-choice questions about the destination, each {"q": string, "options": [4 strings], "answer": index 0-3}'].filter(Boolean).join("; ");
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    instructions: `You write quick, fun group-trip mini games. Return ONLY a JSON object with: ${shape}. Ground content in today's itinerary city: culture, food, colors, words, music and customs. World-famous landmarks are allowed only if they are in today's itinerary city; never invent a landmark or send the group to another place. Each task takes only a few minutes, is free or nearly free, and can be done in public where the squad already is. Apply to every quest: ${FIND_IT_SAFETY} Trivia uses verifiable facts. ${RULES}`,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
    providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
  });
  const text = await result.text;
  await log("openai/gpt-6-astra", await result.usage);
  try { return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as AiOut; } catch { return {}; }
}

const clean = (arr: unknown, n: number, max: number) => Array.isArray(arr) && arr.length >= n && arr.slice(0, n).every((s) => typeof s === "string" && s.trim() && s.length <= max && safeContent(s)) ? (arr.slice(0, n) as string[]).map((s) => s.trim()) : null;
const cleanTrivia = (arr: unknown): Trivia[] | null => Array.isArray(arr) && arr.length >= 6 && arr.slice(0, 6).every((t) => t && typeof t.q === "string" && Array.isArray(t.options) && t.options.length === 4 && t.options.every((o: unknown) => typeof o === "string") && Number.isInteger(t.answer) && t.answer >= 0 && t.answer <= 3 && [t.q,...t.options].every(safeContent)) ? (arr.slice(0, 6) as Trivia[]) : null;

export const prepareTripDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ tripId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), mode: z.enum(["explorer", "local"]).optional(), regenerate: z.boolean().optional() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase.from("trip_members").select("role").eq("trip_id", data.tripId).eq("user_id", context.userId).eq("status", "approved").maybeSingle();
    if (!member) throw new Error("Join this trip first.");
    const leader = member.role === "captain" || member.role === "co_captain";
    if (data.regenerate && !leader) throw new Error("Only the Captain or Co-Captain can change today's games.");
    const { data: trip } = await context.supabase.from("trips").select("*").eq("id", data.tripId).single();
    if (!trip) throw new Error("Trip unavailable.");
    if (!trip.unlocked_at) throw new Error("Unlock this trip to play trip-day games.");
    if (data.date < trip.start_date || data.date > trip.end_date) throw new Error("That date isn't part of the trip.");
    if (!leader && data.date !== todayIn((trip as { trip_timezone?: string | null }).trip_timezone || trip.home_timezone)) throw new Error("Games unlock on the day.");
    const q = await import("./ai-quota.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin.from("trip_day_games").select("*").eq("trip_id", data.tripId).eq("day_date", data.date).maybeSingle();
    // Every regenerate of an existing day spends regen_set credits in any mode; the first generation stays free.
    const paid = data.regenerate && existing ? await q.refundableCredits(context.supabase, data.tripId, "regen_set", context.userId) : null;
    try {
    const aiLog = paid?.log ?? ((m: string, u: Parameters<typeof q.logAppAi>[3]) => q.logAppAi(data.tripId, "auto_trip_day", m, u, context.userId));
    // App-paid first generation obeys the AI cost guard; when refused, the day releases with pre-written pools.
    const aiOk = paid ? true : await q.appAiAllowed("auto_trip_day", data.tripId, context.userId);

    if (!existing || data.regenerate) {
      const [{ data: plan }, { data: tagRows }] = await Promise.all([
        supabaseAdmin.from("trip_itineraries").select("days").eq("trip_id", data.tripId).maybeSingle(),
        supabaseAdmin.from("trip_day_tags").select("day_date,tag").eq("trip_id", data.tripId),
      ]);
      const days = (Array.isArray(plan?.days) ? plan.days : []) as ItineraryDay[];
      const tags = Object.fromEntries((tagRows ?? []).map((t) => [t.day_date, t.tag])) as DayTags;
      const tag = dayTag(data.date, days, tags);
      const day = days.find((d) => d.date === data.date);
      const city = day?.city || trip.destination;
      const mode = data.mode ?? (existing?.bingo_mode as "explorer" | "local" | undefined) ?? "explorer";
      const want = { bingo: tag !== "Travel" && mode === "local", quests: tag !== "Travel", trivia: tag === "Chill" };
      const nr = await import("./content.server");
      const admin = supabaseAdmin as unknown as Parameters<typeof nr.seenSets>[0];
      const [bingoSeen, questSeen, themeSeen, triviaSeen] = await Promise.all([nr.seenSets(admin, data.tripId, "bingo"), nr.seenSets(admin, data.tripId, "quest"), nr.seenSets(admin, data.tripId, "photo_theme"), nr.seenSets(admin, data.tripId, "trivia")]);
      const { data: previously } = await supabaseAdmin.from("trip_day_games").select("bingo,quests,trivia").eq("trip_id", data.tripId).limit(20);
      const alreadyUsed = (previously ?? []).flatMap((r) => [...(Array.isArray(r.bingo) ? r.bingo.filter((x): x is string => typeof x === "string") : []), ...(Array.isArray(r.quests) ? r.quests.filter((x): x is string => typeof x === "string") : []), ...(Array.isArray(r.trivia) ? r.trivia.map((t) => t && typeof t === "object" && !Array.isArray(t) && "q" in t ? String(t["q"]) : "").filter(Boolean) : [])]).slice(-30);
       // Curated city-to-landmark list only: freeform itinerary notes are not evidence.
       const landmarks: Record<string, string> = { bangkok: "Grand Palace", paris: "Eiffel Tower", london: "Tower Bridge", rome: "Colosseum", "new york": "Statue of Liberty", tokyo: "Tokyo Tower", sydney: "Sydney Opera House", cairo: "Pyramids of Giza", agra: "Taj Mahal", barcelona: "Sagrada Família" };
       const landmark = landmarks[city.trim().toLowerCase()];
       const hasLandmark = !!landmark;
       const ai = !aiOk ? ({} as AiOut) : await askAi({ destination: trip.destination, stops: days.map((d) => d.city).filter(Boolean), kind: trip.kind, vibe: trip.vibe, ageTier: "family-safe", approved21Plus: false, rules: { clean: true, group: true }, city, dayType: tag, alreadyUsed, verifiedLandmark: landmark ?? null, findItKinds: FIND_IT_KINDS.filter(k => k !== "Landmark Quest" || hasLandmark) }, want, aiLog).catch((cause) => { if (paid) throw cause; return {} as AiOut; });
      // No repeats: unseen for this trip first, then unused by the Captain's earlier trips.
      const aiBingo = want.bingo ? clean(ai.bingo, 9, 120)?.filter((item) => !bingoSeen.trip.has(nr.keyOf(item))) : null;
      const bingo = tag === "Travel" ? [] : aiBingo?.length === 9 ? aiBingo : nr.pickUnseen(await nr.poolWithVariants(admin, data.tripId, "bingo", EXPLORER_SQUARES), bingoSeen, 9);
      const questPool = want.quests ? await nr.poolWithVariants(admin, data.tripId, "quest", findItPool(hasLandmark)) : [];
      const aiQuests = want.quests ? clean(ai.quests, 3, 160)?.filter((item) => !questSeen.trip.has(nr.keyOf(item))) : null;
      const quests = !want.quests ? [] : aiQuests?.length === 3 ? aiQuests : (() => { const kinds = new Set<string>(); return nr.pickUnseen(questPool, questSeen, questPool.length).filter((q) => { const k = q.split(":")[0]!; if (kinds.has(k)) return false; kinds.add(k); return true; }).slice(0, 3); })();
      await Promise.all([nr.markSeen(admin, data.tripId, "bingo", bingo), nr.markSeen(admin, data.tripId, "quest", quests)]);
      const questsOut = quests.map((q) => q.replaceAll("{city}", city || trip.destination));
      const triviaCandidates = want.trivia ? cleanTrivia(ai.trivia)?.filter((item) => !triviaSeen.trip.has(nr.keyOf(item.q))) : null;
      const trivia = triviaCandidates?.length === 6 ? triviaCandidates : null;
      const theme = existing?.photo_theme || nr.pickUnseen(PHOTO_THEMES, themeSeen, 1)[0]!;
      await Promise.all([nr.markSeen(admin, data.tripId, "photo_theme", [theme]), nr.markSeen(admin, data.tripId, "trivia", (trivia ?? []).map((t) => t.q))]);
      const airport = tag === "Travel" ? seededShuffle([0, 1, 2, 3, 4], data.tripId + data.date).slice(0, 3).sort() : [];
      const row = { trip_id: data.tripId, day_date: data.date, tag, city, bingo_mode: mode, bingo, quests: questsOut, trivia: (trivia ?? []).map(({ q, options }) => ({ q, options })), photo_theme: theme, airport };
      const { error } = await supabaseAdmin.from("trip_day_games").upsert(row);
      if (error) throw new Error(error.message);
      if (trivia) await supabaseAdmin.from("trip_day_trivia_keys").upsert({ trip_id: data.tripId, day_date: data.date, answers: trivia.map((t) => t.answer) });
    }

    // Give every member (including late joiners) a private secret mission.
    const [{ data: members }, { data: missions }] = await Promise.all([
      supabaseAdmin.from("trip_members").select("user_id,joined_at").eq("trip_id", data.tripId).order("joined_at"),
      supabaseAdmin.from("secret_missions").select("user_id").eq("trip_id", data.tripId).eq("day_date", data.date),
    ]);
    const have = new Set((missions ?? []).map((m) => m.user_id));
    const missing = (members ?? []).filter((m) => !have.has(m.user_id));
    if (missing.length) {
      const nr = await import("./content.server");
      const admin = supabaseAdmin as unknown as Parameters<typeof nr.seenSets>[0];
      const all = await nr.poolWithVariants(admin, data.tripId, "mission", SECRET_MISSIONS);
      const fresh = nr.pickUnseen(all, await nr.seenSets(admin, data.tripId, "mission"), missing.length);
      const picks = missing.map((_, i) => fresh[i] ?? all[i % all.length]!);
      await supabaseAdmin.from("secret_missions").insert(missing.map((m, i) => ({ trip_id: data.tripId, day_date: data.date, user_id: m.user_id, mission: picks[i]! })));
      await nr.markSeen(admin, data.tripId, "mission", picks);
    }
    return { ok: true };
    } catch (cause) { if (paid) await paid.refund(); throw cause; }
  });
