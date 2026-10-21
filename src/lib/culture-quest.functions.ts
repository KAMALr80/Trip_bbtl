import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { spendCredits } from "./ai-quota.server";

export const draftCultureQuest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(v => z.object({ cardId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: card, error } = await context.supabase.from("cultural_inspirations").select("id,trip_id,creator_id,partner_id,title,category,country,region,city,backstory,steps,meaning,needs,photo_path").eq("id", data.cardId).single();
    if (error || !card || (card.creator_id !== context.userId && card.partner_id !== context.userId)) throw new Error("Only creators can draft this quest.");
    const key = process.env['LOVABLE_API_KEY'];
    if (!key) throw new Error("AI help is unavailable right now.");
    const log = await spendCredits(context.supabase, card.trip_id, "inspiration_guide");
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { generateText } = await import("ai");
    const provider = createOpenAI({ baseURL: "https://ai.gateway.lovable.dev/v1", apiKey: key, headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" } });
    const result = await generateText({ model: provider.responses("openai/gpt-6-astra"), instructions: 'Draft exactly three multiple-choice questions as a JSON array, one each for Guess It, Picture It, Live It. Each entry: {"round":1,"prompt":"...","options":["...","...","...","..."],"answer":0,"challenge":"..."}. Round 2 question must refer to the creator photo; round 3 is a simple real-world action. Use the creator’s Country → Region → City and category only as context. Use ONLY the provided notes for claims. Never invent facts about family, origins, ingredients or pronunciation. If notes are insufficient, make a neutral question about their described experience. Safe, clean, kind, respectful: no politics, religion, sex, drugs, alcohol, unsafe or illegal acts. No markdown.', prompt: JSON.stringify({ ...card, location: `${card.country ?? ""} → ${card.region ?? ""} → ${card.city ?? ""}`, ageTier: "family-safe", approved21Plus: false }), providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", store: false } } });
    await log("openai/gpt-6-astra", result.usage);
    const clean = result.text.replace(/^```(?:json)?\s*|\s*```$/g, "");
    try { return z.array(z.object({ round: z.number().int().min(1).max(3), prompt: z.string().max(500), options: z.array(z.string().max(150)).length(4), answer: z.number().int().min(0).max(3), challenge: z.string().optional() })).length(3).parse(JSON.parse(clean)); }
    catch { throw new Error("The draft couldn't be read. Please try again or write your own."); }
  });