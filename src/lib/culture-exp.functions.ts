import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { spendCredits } from "./ai-quota.server";
import { RULES, safeContent } from "./content-rules";

const POLICY = `${RULES} Tailor to this exact place and culture; cover food, music, art, sports, language, history, traditions and daily life. Never invent family history. No long articles.`;
const CardSchema = z.object({ title: z.string().min(1).max(120), what_to_do: z.string().min(1).max(600), backstory: z.string().max(600), keywords: z.array(z.string().max(60)).min(2).max(4), points: z.number().int().min(5).max(30) });

type Ctx = { supabase: any; userId: string };

/** Loads the experience the caller created, and checks they may spend the linked trip's credits (leader only). */
async function loadForAi(ctx: Ctx, id: string) {
  const { data: exp } = await ctx.supabase.from("culture_experiences").select("*").eq("id", id).maybeSingle();
  if (!exp || exp.creator_id !== ctx.userId) throw new Error("Only the creator can do this.");
  if (!exp.trip_id) throw new Error("NO_TRIP_CREDITS: AI planning outside a trip uses your wallet — credit packs are coming soon. Link a trip where you're Captain or Co-Captain to use trip credits.");
  const { data: m } = await ctx.supabase.from("trip_members").select("role,status").eq("trip_id", exp.trip_id).eq("user_id", ctx.userId).maybeSingle();
  if (!m || m.status !== "approved" || !["captain", "co_captain"].includes(m.role)) throw new Error("NO_TRIP_CREDITS: AI planning outside a trip uses your wallet — credit packs are coming soon. Link a trip where you're Captain or Co-Captain to use trip credits.");
  return exp as { id: string; track: string; trip_id: string; title: string; country: string; region: string | null; city: string | null; days: number; start_date: string; a2e_kind: string | null; culture_layer: string | null; traveler_types: string[] | null };
}

async function runAi(instructions: string, payload: object, log: (m: string, u: any) => Promise<void>) {
  const { getAiModel } = await import("@/integrations/ai/index.server");
  const ai = getAiModel();
  if (!ai) throw new Error("AI help is unavailable right now.");
  const { streamText } = await import("ai");
  const result = streamText({ model: ai.model, instructions: `${instructions} ${POLICY}`, messages: [{ role: "user", content: JSON.stringify(payload) }], providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } } });
  const text = await result.text;
  await log(ai.modelId, await result.usage);
  return text;
}

export const planCultureExperience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ id: z.string().uuid(), answers: z.array(z.object({ q: z.string().max(200), a: z.string().max(300) })).max(5) }).parse(v))
  .handler(async ({ data, context }) => {
    const exp = await loadForAi(context as Ctx, data.id);
    const { data: trip } = await context.supabase.from("trips").select("destination,kind,vibe").eq("id", exp.trip_id).single();
    const { data: existing } = await context.supabase.from("culture_exp_days").select("day_number,title,what_to_do").eq("experience_id", exp.id).order("day_number");
    const offset = exp.a2e_kind === "inspire" ? existing?.length ?? 0 : 0;
    const count = Math.min(31, exp.days - offset);
    if (count < 1) throw new Error("All days are planned.");
    const log = await spendCredits(context.supabase, exp.trip_id, "inspiration_guide");
    const text = await runAi(
      `Create exactly ${count} distinct daily cards for a ${exp.track === "home" ? "from-home culture experience (things to do near home)" : "travel documenting experience (game-style daily cards for places visited)"}. Focus on the selected layer, local voices and why each activity matters. Return ONLY a JSON array; each item {title, what_to_do (one real interactive action, 1-2 sentences), backstory (1-3 sentences why it matters there), keywords (2-4 'search for' phrases), points (5-30)}.`,
      { place: { country: exp.country, region: exp.region, city: exp.city }, title: exp.title, days: count, layer: exp.culture_layer, travelerTypes: exp.traveler_types, startDate: exp.start_date, tripDestination: trip?.destination, kind: trip?.kind, vibe: trip?.vibe, ageTier: "family-safe", approved21Plus: false, rules: { clean: true, noAlcohol: true }, creatorAnswers: data.answers, alreadyUsed: existing ?? [] },
      log,
    );
    const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
    const cards = z.array(CardSchema).parse(JSON.parse(json)).slice(0, count);
    if (cards.some(c => ![c.title,c.what_to_do,c.backstory,...c.keywords].every(safeContent))) throw new Error("Generated cards did not meet the content rules.");
    return cards.map((c, i) => ({ ...c, day_number: offset + i + 1, source: "ai" as const }));
  });

export const summarizeCultureTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const exp = await loadForAi(context as Ctx, data.id);
    const { data: days } = await context.supabase.from("culture_exp_days").select("day_number,title,place,review_stars,review_text,note,fact,photos").eq("experience_id", exp.id).not("done_at", "is", null).order("day_number");
    if (!days?.length) throw new Error("Log at least one day first.");
    const log = await spendCredits(context.supabase, exp.trip_id, "inspiration_guide");
    const text = await runAi(
      "Write a short, warm trip preview (under 700 characters, plain text) using ONLY the traveler's own stops, reviews and notes below. Do not invent places, facts or people.",
      { place: { country: exp.country, region: exp.region, city: exp.city }, title: exp.title, stops: days.map((d: any) => ({ day: d.day_number, card: d.title, place: d.place, stars: d.review_stars, review: d.review_text, note: d.note, fact: d.fact, photoCount: d.photos?.length ?? 0 })), ageTier: "family-safe" },
      log,
    );
    return text.trim().slice(0, 1500);
  });
