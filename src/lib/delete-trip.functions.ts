import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const permanentlyDeleteTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) =>
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
    const files: { bucket: string; paths: string[] }[] = [];
    const { data: inspirations } = await context.supabase
      .from("cultural_inspirations")
      .select("photo_path")
      .eq("trip_id", data.tripId);
    for (const bucket of ["trip-photos", "player-avatars"]) {
      const paths: string[] = [];
      const visit = async (prefix: string) => {
        let offset = 0;
        while (true) {
          const { data: entries, error } = await supabaseAdmin.storage
            .from(bucket)
            .list(prefix, { limit: 100, offset });
          if (error) throw new Error(error.message);
          for (const entry of entries ?? []) {
            const path = `${prefix}/${entry.name}`;
            if (entry.id) paths.push(path);
            else await visit(path);
          }
          if (!entries || entries.length < 100) break;
          offset += entries.length;
        }
      };
      await visit(data.tripId);
      files.push({ bucket, paths });
    }
    files.push({
      bucket: "inspiration-photos",
      paths: (inspirations ?? [])
        .map((item) => item.photo_path)
        .filter((path): path is string => !!path),
    });
    const { error } = await context.supabase.rpc(
      "delete_trip" as never,
      { p_trip: data.tripId, p_name: data.name } as never,
    );
    if (error) throw new Error(error.message);
    for (const file of files)
      for (let offset = 0; offset < file.paths.length; offset += 100) {
        const { error: storageError } = await supabaseAdmin.storage
          .from(file.bucket)
          .remove(file.paths.slice(offset, offset + 100));
        if (storageError)
          throw new Error(
            `Trip deleted, but photo cleanup needs attention: ${storageError.message}`,
          );
      }
    return { ok: true };
  });
