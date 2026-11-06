import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sweepOrphanFiles } from "./trip-storage";

export const permanentlyDeleteTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value) =>
    z.object({ tripId: z.string().uuid(), name: z.string().min(1).max(100) }).parse(value),
  )
  .handler(async ({ data, context }) => {
    // Authenticated RPC checks the Captain and exact trip name before anything is deleted.
    const { data: trip, error: lookupError } = await context.supabase
      .from("trips")
      .select("name")
      .eq("id", data.tripId)
      .maybeSingle();
    if (
      lookupError ||
      !trip ||
      (trip.name !== data.name && data.name.trim().toUpperCase() !== "DELETE")
    )
      throw new Error("Trip name does not match.");
    const { data: role } = await context.supabase
      .from("trip_members")
      .select("role")
      .eq("trip_id", data.tripId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (role?.role !== "captain") throw new Error("Captain only.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await context.supabase.rpc(
      "delete_trip" as never,
      { p_trip: data.tripId, p_name: data.name } as never,
    );
    if (error) throw new Error(error.message);
    // The trip's files are orphans now. Whatever this misses, the daily cleanup deletes.
    const swept = await sweepOrphanFiles(supabaseAdmin);
    if (swept.failed || swept.error) console.error("Trip deleted; photo cleanup will retry", swept);
    return { ok: true };
  });
