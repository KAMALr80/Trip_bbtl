import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateArcadeMix } from "./arcade-mix.server";
import { spendAiQuota } from "./ai-quota.server";

export const arcadeMix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(value => z.object({ tripId: z.string().uuid().nullable() }).parse(value))
  .handler(async ({ data, context }) => {
    // Same single AI path as every other feature; "arcade_mix" applies the existing mix rules (3 free, then 1 credit, daily cap).
    const log = await spendAiQuota(context.supabase, "arcade_mix", data.tripId);
    const { text, usage } = await generateArcadeMix();
    await log("openai/gpt-6-astra", usage);
    return text;
  });
