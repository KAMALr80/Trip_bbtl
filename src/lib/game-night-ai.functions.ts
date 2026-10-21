import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RULES, safeContent } from "./content-rules";

export const generateGameCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) =>
    z
      .object({
        tripId: z.string().uuid(),
        category: z.enum([
          "get-to-know",
          "two-truths",
          "childhood",
          "songs",
          "destination-trivia",
          "phrases",
          "most-likely",
          "would-you-rather",
          "camera-roll",
          "emoji",
        ]),
      })
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    const { data: member, error } = await context.supabase
      .from("trip_members")
      .select("role")
      .eq("trip_id", data.tripId)
      .eq("user_id", context.userId)
      .eq("status", "approved")
      .maybeSingle();
    if (error || !member) throw new Error("Join this trip to add cards.");
    const { data: trip } = await context.supabase
      .from("trips")
      .select("destination,kind,vibe")
      .eq("id", data.tripId)
      .single();
    if (!trip) throw new Error("Trip unavailable.");
    if (!["captain", "co_captain"].includes(member.role))
      throw new Error("Only the Captain or Co-Captain can use AI credits.");
    const { refundableCredits } = await import("./ai-quota.server");
    const paid = await refundableCredits(
      context.supabase,
      data.tripId,
      "custom_game",
      context.userId,
    );
    const log = paid.log;
    try {
      const { data: itinerary } = await context.supabase
        .from("trip_itineraries")
        .select("days")
        .eq("trip_id", data.tripId)
        .maybeSingle();
      const { data: recent } = await context.supabase
        .from("game_cards")
        .select("prompt")
        .eq("trip_id", data.tripId)
        .eq("category", data.category)
        .limit(20);
      const stops = Array.isArray(itinerary?.days)
        ? itinerary.days
            .map((day) =>
              day && typeof day === "object" && !Array.isArray(day) && "city" in day
                ? String(day["city"])
                : "",
            )
            .filter(Boolean)
        : [];
      const { streamText } = await import("ai");
      const { getAiModel } = await import("@/integrations/ai/index.server");
      const ai = getAiModel();
      if (!ai) throw new Error("Cards are unavailable right now.");
      const result = streamText({
        model: ai.model,
        instructions: `Write exactly 10 fresh, short game-night prompt cards in a JSON array of strings, no markdown. Tailor to the destination and stops without inventing local facts or claiming unverified trivia answers. When it fits the category, weave in a film, documentary, TV scene, athlete or musician connected to the destination: e.g. act out a respectful scene, tell a story about a documentary, or ask a verifiable culture trivia question. Never assume a specific work or person is from the destination without a reliable fact; otherwise keep it general. These are existing game cards, not a new game or points category. Inclusive, fun and interactive, clean for everyone: no politics, religion, sex, drugs, unsafe, unethical or illegal acts. Alcohol only when approved adults and trip rules permit it; these cards are clean, so avoid alcohol. Spicy means bolder or harder, never sexual. For camera-roll cards choose random numbers 1 to 240. Each card under 220 characters. Do not repeat already-used cards. ${RULES}`,
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              category: data.category,
              destination: trip.destination,
              stops,
              kind: trip.kind,
              vibe: trip.vibe,
              ageTier: "family-safe",
              approved21Plus: false,
              rules: { noAlcohol: true, clean: true },
              alreadyUsed: (recent ?? []).map((r) => r.prompt),
            }),
          },
        ],
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "low",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      });
      const text = await result.text;
      await log(ai.modelId, await result.usage);
      const match = text.match(/\[[\s\S]*\]/);
      let parsed: unknown;
      try {
        parsed = JSON.parse(match?.[0] ?? "");
      } catch {
        throw new Error("Couldn't read the new cards. Please try again.");
      }
      if (
        !Array.isArray(parsed) ||
        parsed.length !== 10 ||
        !parsed.every(
          (item) =>
            typeof item === "string" &&
            item.trim().length > 0 &&
            item.length <= 220 &&
            safeContent(item),
        )
      )
        throw new Error("Couldn't read the new cards. Please try again.");
      const { error: insertError } = await context.supabase.from("game_cards").insert(
        parsed.map((prompt: string) => ({
          trip_id: data.tripId,
          category: data.category,
          prompt: prompt.trim(),
        })),
      );
      if (insertError) throw new Error(insertError.message);
      return { count: 10 };
    } catch (cause) {
      await paid.refund();
      throw cause;
    }
  });
