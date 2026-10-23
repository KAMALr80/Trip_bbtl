import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateTripMottos, generateTripNames } from "./trip-names.server";
import { spendAiQuota } from "./ai-quota.server";

export const suggestTripNames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) =>
    z
      .object({
        destination: z.string().trim().min(1).max(120),
        startDate: z.string().max(10).optional(),
        endDate: z.string().max(10).optional(),
        tripType: z.string().trim().max(60).optional(),
      })
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    const log = await spendAiQuota(context.supabase, "names", null);
    return generateTripNames(data, log);
  });

export const suggestTripMottos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) =>
    z
      .object({
        name: z.string().trim().min(1).max(100),
        destination: z.string().trim().min(1).max(120),
        tripType: z.string().trim().max(60).optional(),
      })
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    const log = await spendAiQuota(context.supabase, "names", null);
    return generateTripMottos(data, log);
  });
