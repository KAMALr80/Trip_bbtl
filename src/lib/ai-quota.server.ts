import { rpcOn } from "@/data/rpc-core";
type Rpc = {
  rpc: (
    fn: string,
    args: object,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** Estimated USD per 1M tokens, used only for the founder's cost report: the provider's prices for
 * AI_MODEL, set as AI_PRICE_IN / AI_PRICE_OUT per environment, else a rough default. */
function rate(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
export function estimateCost(_model: string, input: number, output: number) {
  return (input * rate("AI_PRICE_IN", 1.25) + output * rate("AI_PRICE_OUT", 10)) / 1_000_000;
}

export type UsageLog = (
  model: string,
  usage: { inputTokens?: number | undefined; outputTokens?: number | undefined } | undefined,
) => Promise<void>;

function logger(supabase: unknown, usageId: string | null): UsageLog {
  return async (model, usage) => {
    if (!usageId) return;
    const i = usage?.inputTokens ?? 0,
      o = usage?.outputTokens ?? 0;
    try {
      await (supabase as Rpc).rpc("log_ai_call", {
        p_usage: usageId,
        p_model: model,
        p_in: i,
        p_out: o,
        p_cost: estimateCost(model, i, o),
      });
    } catch {
      /* logging never blocks the feature */
    }
  };
}

// Checks beta access, trip membership and today's limit in the database, logs the use, and returns a token/cost logger.
// Itinerary reads beyond 20/day spend 2 trip credits instead of refusing.
export async function spendAiQuota(
  supabase: unknown,
  kind: "names" | "itinerary" | "arcade_mix",
  tripId: string | null,
): Promise<UsageLog> {
  const { data, error } = await (supabase as Rpc).rpc("use_ai_quota", {
    p_kind: kind,
    p_trip: tripId,
  });
  if (error) throw new Error(error.message);
  return logger(supabase, typeof data === "string" ? data : null);
}

export type CreditAction =
  | "custom_game"
  | "regen_set"
  | "dest_activities"
  | "team_challenges"
  | "athome_pack"
  | "itinerary_extra"
  | "inspiration_guide"
  | "mission_topup";

/** Atomically spends trip AI credits on the server (refuses when empty) and returns a token/cost logger. */
export async function spendCredits(
  supabase: unknown,
  tripId: string,
  action: CreditAction,
): Promise<UsageLog> {
  const { data, error } = await (supabase as Rpc).rpc("spend_ai_credits", {
    p_trip: tripId,
    p_action: action,
  });
  if (error) throw new Error(error.message);
  return logger(supabase, typeof data === "string" ? data : null);
}

/** The same authenticated spender can reverse a failed request once; the database retains its failure row. */
export async function refundableCredits(
  supabase: unknown,
  tripId: string,
  action: "custom_game" | "regen_set" | "mission_topup",
  userId: string,
) {
  const { data, error } = await (supabase as Rpc).rpc("spend_ai_credits", {
    p_trip: tripId,
    p_action: action,
  });
  if (error || typeof data !== "string")
    throw new Error(error?.message ?? "Could not spend credits");
  return {
    log: logger(supabase, data),
    refund: async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const result = await supabaseAdmin.rpc("refund_failed_ai", {
        p_usage: data,
        p_user: userId,
      });
      if (result.error) throw new Error(result.error.message);
    },
  };
}

/** App-paid background AI (no user/credits): logged with the service role for the cost report. */
/** Server-side AI cost guard for app-paid calls: true when allowed (AI on, under the daily caps). Fails closed. */
export async function appAiAllowed(
  kind: string,
  tripId: string | null,
  userId: string | null,
): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await rpcOn(supabaseAdmin, "ai_gate_server", {
      p_kind: kind,
      p_trip: tripId,
      p_user: userId,
    });
    return !error && data == null;
  } catch {
    return false;
  }
}

export const AI_BREAK = "AI ideas are taking a break — pre-written content keeps playing.";

export async function logAppAi(
  tripId: string | null,
  kind: string,
  model: string,
  usage: { inputTokens?: number | undefined; outputTokens?: number | undefined } | undefined,
  userId: string | null = null,
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const i = usage?.inputTokens ?? 0,
      o = usage?.outputTokens ?? 0;
    await supabaseAdmin.from("ai_usage").insert({
      trip_id: tripId,
      user_id: userId,
      kind,
      model,
      input_tokens: i,
      output_tokens: o,
      est_cost_usd: estimateCost(model, i, o),
    });
  } catch {
    /* never blocks */
  }
}
