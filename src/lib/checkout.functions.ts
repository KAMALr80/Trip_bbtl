import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Beta checkout: the server prices, discounts and stores the order; the client never sets paid status. */
export const checkoutBeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ tripId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: orderId, error } = await (context.supabase as any).rpc("checkout_beta", {
      p_trip: data.tripId,
    });
    if (error) throw new Error(error.message);
    return { orderId: orderId as string };
  });
