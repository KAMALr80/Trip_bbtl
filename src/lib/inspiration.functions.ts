import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { spendCredits } from "./ai-quota.server";
import { RULES, safeContent } from "./content-rules";

export const makeInspirationGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) =>
    z
      .object({
        tripId: z.string().uuid(),
        category: z.enum(["Food", "Art", "Song", "Language", "Tradition", "Your own idea"]),
        title: z.string().trim().min(1).max(120),
        notes: z.string().trim().min(10).max(4000),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase
      .from("trip_members")
      .select("status")
      .eq("trip_id", data.tripId)
      .eq("user_id", context.userId)
      .eq("status", "approved")
      .maybeSingle();
    if (!member) throw new Error("Join this squad first.");
    const { getAiModel } = await import("@/integrations/ai/index.server");
    const ai = getAiModel();
    if (!ai) throw new Error("AI help is unavailable right now.");
    const log = await spendCredits(context.supabase, data.tripId, "inspiration_guide");
    const { data: previous } = await context.supabase
      .from("cultural_inspirations")
      .select("title,steps,backstory")
      .eq("trip_id", data.tripId)
      .order("created_at", { ascending: false })
      .limit(30);
    const { streamText } = await import("ai");
    const { data: trip } = await context.supabase
      .from("trips")
      .select("destination,kind,vibe")
      .eq("id", data.tripId)
      .single();
    const result = streamText({
      model: ai.model,
      instructions: `Turn the user's own notes into a short, clear, numbered how-to someone can follow. Do not invent family history, ingredients, cultural claims, pronunciation, lyrics, or facts absent from the notes. Safe, clean and respectful: no politics, religion, sex, drugs, alcohol, unsafe or illegal acts. Return plain text only, under 2000 characters. ${RULES}`,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            ...data,
            destination: trip?.destination,
            kind: trip?.kind,
            vibe: trip?.vibe,
            ageTier: "family-safe",
            approved21Plus: false,
            alreadyUsed: (previous ?? []).map((item) => ({
              title: item.title,
              steps: item.steps,
              backstory: item.backstory,
            })),
            rules: "Follow only the creator's notes; do not invent cultural facts.",
          }),
        },
      ],
      providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", store: false } },
    });
    const text = (await result.text).slice(0, 5000);
    await log(ai.modelId, await result.usage);
    if (!safeContent(text)) throw new Error("The guide did not meet the content rules.");
    return text;
  });
