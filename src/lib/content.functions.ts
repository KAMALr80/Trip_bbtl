import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EXPLORER_SQUARES, SECRET_MISSIONS, findItPool } from "./trip-games";
import { RULES } from "./content-rules";

const SAFE = RULES;
const COOLDOWN_MS = 6 * 3600 * 1000;

/** When a trip has used 80% of a pool, write fresh variants for its vibe/destination. Paid by the app, not the user's AI limit. */
export const topUpContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ tripId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase
      .from("trip_members")
      .select("role")
      .eq("trip_id", data.tripId)
      .eq("user_id", context.userId)
      .eq("status", "approved")
      .maybeSingle();
    if (!member) return { added: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Parameters<
      typeof import("./content.server").seenSets
    >[0];
    const { seenSets, poolWithVariants, keyOf, askList } = await import("./content.server");
    const { data: trip } = await supabaseAdmin
      .from("trips")
      .select("destination,vibe,kind,is_sandbox")
      .eq("id", data.tripId)
      .single();
    if (!trip) return { added: 0 };
    const { data: tops } = await supabaseAdmin
      .from("content_topups" as never)
      .select("kind,last_at")
      .eq("trip_id" as never, data.tripId as never);
    const recent = new Set(
      ((tops ?? []) as { kind: string; last_at: string }[])
        .filter((t) => Date.now() - new Date(t.last_at).getTime() < COOLDOWN_MS)
        .map((t) => t.kind),
    );
    const stamp = (kind: string) =>
      supabaseAdmin
        .from("content_topups" as never)
        .upsert({ trip_id: data.tripId, kind, last_at: new Date().toISOString() } as never);
    const { data: itinerary } = await supabaseAdmin
      .from("trip_itineraries")
      .select("days")
      .eq("trip_id", data.tripId)
      .maybeSingle();
    const ctx = {
      destination: trip.destination,
      stops: Array.isArray(itinerary?.days)
        ? itinerary.days
            .map((d) =>
              d && typeof d === "object" && !Array.isArray(d) && "city" in d
                ? String(d["city"])
                : "",
            )
            .filter(Boolean)
        : [],
      kind: trip.kind,
      vibe: trip.vibe,
      ageTier: "clean for everyone",
      approved21Plus: false,
      rules: SAFE,
    };
    let added = 0;

    // Text pools: bingo squares, quests, secret missions.
    const text: { kind: "bingo" | "quest" | "mission"; base: string[]; ask: string; n: number }[] =
      [
        {
          kind: "bingo",
          base: EXPLORER_SQUARES,
          ask: "Write 12 travel bingo squares (under 70 chars).",
          n: 12,
        },
        {
          kind: "quest",
          base: findItPool(false),
          ask: "Write 6 Find It quests from different hunt kinds that end with a photo (under 120 chars). Never invent landmarks.",
          n: 6,
        },
        {
          kind: "mission",
          base: SECRET_MISSIONS,
          ask: "Write 8 playful secret missions a player completes without the squad noticing (under 120 chars).",
          n: 8,
        },
      ];
    for (const t of text) {
      if (recent.has(t.kind)) continue;
      const pool = await poolWithVariants(admin, data.tripId, t.kind, t.base);
      const seen = await seenSets(admin, data.tripId, t.kind);
      if (pool.filter((p) => seen.trip.has(keyOf(p))).length < pool.length * 0.8) continue;
      await stamp(t.kind);
      const fresh = (
        await askList(
          `${t.ask} ${SAFE}`,
          {
            ...ctx,
            examples: pool.slice(0, 20),
            alreadyUsed: pool.filter((item) => seen.trip.has(keyOf(item))).slice(-20),
          },
          data.tripId,
          undefined,
          context.userId,
        )
      ).slice(0, t.n);
      if (fresh.length) {
        await supabaseAdmin
          .from("content_variants" as never)
          .upsert(
            fresh.map((s) => ({ trip_id: data.tripId, kind: t.kind, text: s })) as never,
            { onConflict: "trip_id,kind,text", ignoreDuplicates: true } as never,
          );
        added += fresh.length;
      }
    }

    // Question of the Week.
    if (!recent.has("qotw")) {
      const [{ count: base }, { count: extra }, { count: seen }] = await Promise.all([
        supabaseAdmin
          .from("weekly_question_pool")
          .select("id", { count: "exact", head: true })
          .eq("spicy", false),
        supabaseAdmin
          .from("content_variants" as never)
          .select("id", { count: "exact", head: true })
          .eq("trip_id" as never, data.tripId as never)
          .eq("kind" as never, "qotw" as never),
        supabaseAdmin
          .from("content_seen" as never)
          .select("item_key", { count: "exact", head: true })
          .eq("trip_id" as never, data.tripId as never)
          .eq("kind" as never, "qotw" as never),
      ]);
      if ((seen ?? 0) >= ((base ?? 0) + (extra ?? 0)) * 0.8) {
        await stamp("qotw");
        const { data: sample } = await supabaseAdmin
          .from("weekly_question_pool")
          .select("prompt")
          .eq("spicy", false)
          .limit(15);
        const fresh = (
          await askList(
            `Write 8 open-ended Question of the Week prompts friends answer in one line before a group trip (under 140 chars). ${SAFE}`,
            { ...ctx, examples: (sample ?? []).map((s) => s.prompt) },
            data.tripId,
            undefined,
            context.userId,
          )
        ).slice(0, 8);
        if (fresh.length) {
          await supabaseAdmin
            .from("content_variants" as never)
            .upsert(
              fresh.map((s) => ({ trip_id: data.tripId, kind: "qotw", text: s })) as never,
              { onConflict: "trip_id,kind,text", ignoreDuplicates: true } as never,
            );
          added += fresh.length;
        }
      }
    }

    // At Home packs: when this experience has used 80% of its destination's questions, grow the shared pack (clean, never 21+).
    if (!recent.has("at_home")) {
      const { data: acts } = await supabaseAdmin
        .from("at_home_activities" as never)
        .select("item_id")
        .eq("trip_id" as never, data.tripId as never);
      const ids = ((acts ?? []) as { item_id: string | null }[])
        .map((a) => a.item_id)
        .filter((x): x is string => !!x);
      if (ids.length) {
        const { data: items } = await supabaseAdmin
          .from("at_home_pack_items" as never)
          .select("pack,category")
          .in("id" as never, ids as never);
        const rows = (items ?? []) as { pack: string; category: string }[];
        const pack = rows[0]?.pack;
        const usedQ = rows.filter((r) => r.category === "question").length;
        if (pack) {
          const { data: pool } = await supabaseAdmin
            .from("at_home_pack_items" as never)
            .select("body")
            .eq("pack" as never, pack as never)
            .eq("category" as never, "question" as never)
            .eq("adult" as never, false as never);
          const list = ((pool ?? []) as { body: string }[]).map((p) => p.body);
          if (usedQ >= list.length * 0.8) {
            await stamp("at_home");
            const fresh = (
              await askList(
                `Write 6 clean, friendly group questions about ${pack} culture that friends answer and vote on from home (under 120 chars). Family-friendly, no alcohol, no teasing. ${SAFE}`,
                { destination: pack, vibe: "family", examples: list.slice(0, 15) },
                data.tripId,
                undefined,
                context.userId,
              )
            )
              .slice(0, 6)
              .filter((q) => !list.includes(q));
            if (fresh.length) {
              await supabaseAdmin.from("at_home_pack_items" as never).insert(
                fresh.map((body) => ({
                  pack,
                  category: "question",
                  title: "Question",
                  body,
                  adult: false,
                })) as never,
              );
              added += fresh.length;
            }
          }
        }
      }
    }

    // Game cards: the pool of the last drawn card (same game and category). Never auto-writes 21+ cards.
    const { data: state } = await supabaseAdmin
      .from("trip_play_state")
      .select("draw_card_id")
      .eq("trip_id", data.tripId)
      .maybeSingle();
    if (state?.draw_card_id) {
      const { data: card } = await supabaseAdmin
        .from("game_cards")
        .select("category,game_number,prompt")
        .eq("id", state.draw_card_id)
        .single();
      const kind = card ? `card:${card.category}:${card.game_number ?? "-"}` : "";
      if (card && card.category !== "spicy" && !recent.has(kind)) {
        let q = supabaseAdmin
          .from("game_cards")
          .select("id,prompt")
          .eq("category", card.category)
          .or(`trip_id.is.null,trip_id.eq.${data.tripId}`);
        q =
          card.game_number == null
            ? q.is("game_number", null)
            : q.eq("game_number", card.game_number);
        const { data: pool } = await q;
        const { data: seenRows } = await supabaseAdmin
          .from("content_seen" as never)
          .select("item_key")
          .eq("trip_id" as never, data.tripId as never)
          .eq("kind" as never, "card" as never);
        const seen = new Set(((seenRows ?? []) as { item_key: string }[]).map((r) => r.item_key));
        const list = pool ?? [];
        if (list.filter((c) => seen.has(String(c.id))).length >= list.length * 0.8) {
          await stamp(kind);
          const { data: game } = card.game_number
            ? await supabaseAdmin
                .from("game_catalog")
                .select("name,how_to_play")
                .eq("number", card.game_number)
                .maybeSingle()
            : { data: null };
          const fresh = (
            await askList(
              `Write 10 fresh game-night prompt cards for the "${card.category.replaceAll("-", " ")}" category${game ? ` of the game "${game.name}" (${game.how_to_play})` : ""}, under 140 chars each, matching the examples' style. ${SAFE}`,
              { ...ctx, examples: list.slice(0, 15).map((c) => c.prompt) },
              data.tripId,
              undefined,
              context.userId,
            )
          ).slice(0, 10);
          if (fresh.length) {
            await supabaseAdmin.from("game_cards").insert(
              fresh.map((prompt) => ({
                trip_id: data.tripId,
                category: card.category,
                game_number: card.game_number,
                prompt,
              })),
            );
            added += fresh.length;
          }
        }
      }
    }
    return { added };
  });

/** Fire-and-forget from the client after a draw or a day loads. */
export function nudgeTopUp(tripId: string) {
  void topUpContent({ data: { tripId } }).catch(() => undefined);
}
