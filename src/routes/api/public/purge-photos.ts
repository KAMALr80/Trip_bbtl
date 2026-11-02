import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rpcOn } from "@/data/rpc-core";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import type { Database } from "@/integrations/supabase/types";

/** Delete what the lock left behind, trip by trip. Returns the trips finished and objects removed. */
async function purgeAfterLock(admin: SupabaseClient<Database>) {
  const { data, error } = await rpcOn(admin, "photos_to_purge", { p_limit: 20 });
  if (error) return { trips: 0, removed: 0, error: error.message };
  const byTrip = new Map<string, Map<string, string[]>>();
  for (const row of data ?? []) {
    const buckets = byTrip.get(row.trip_id) ?? new Map<string, string[]>();
    byTrip.set(row.trip_id, buckets);
    if (row.bucket && row.path)
      buckets.set(row.bucket, [...(buckets.get(row.bucket) ?? []), row.path]);
  }
  let trips = 0;
  let removed = 0;
  for (const [tripId, buckets] of byTrip) {
    let n = 0;
    for (const [bucket, paths] of buckets) {
      for (let i = 0; i < paths.length; i += 500) {
        const { data: gone } = await admin.storage.from(bucket).remove(paths.slice(i, i + 500));
        n += gone?.length ?? 0;
      }
    }
    const { data: left } = await rpcOn(admin, "finish_photo_purge", {
      p_trip: tripId,
      p_removed: n,
    });
    if (left === 0) trips++;
    removed += n;
  }
  return { trips, removed };
}

// Daily cleanup (pg_cron). Callers must present the cron secret (platform secret, or the scheduler's
// server-only key).
// 1. M5-05 (R-607, Q11): after a trip's Day 7 lock, every photo of the trip except the postcard's is
//    deleted from Storage. The database lists them (photos_to_purge) and is told what was removed
//    (finish_photo_purge, which marks the proofs and logs the run); postcard photos are never listed.
// 2. Backstop: the older photo wall of trips closed more than 12 months ago.
export const Route = createFileRoute("/api/public/purge-photos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (denied) {
          const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
          if (!token) return denied;
          const { data: ok } = await supabaseAdmin.rpc(
            "check_cron_key" as never,
            { p_name: "purge_photos", p_key: token } as never,
          );
          if (ok !== true) return new Response("Unauthorized", { status: 401 });
        }
        const postcards = await purgeAfterLock(supabaseAdmin);
        const cutoff = new Date(Date.now() - 365 * 86400000);
        const { data: trips, error } = await supabaseAdmin
          .from("trips")
          .select("id, end_date, ended_at")
          .is("photos_purged_at", null)
          .lte("end_date", cutoff.toISOString().slice(0, 10))
          .limit(50);
        if (error) return new Response("error", { status: 500 });
        let purged = 0;
        for (const t of trips ?? []) {
          const closedAt = t.ended_at
            ? new Date(t.ended_at)
            : new Date(new Date(`${t.end_date}T00:00:00Z`).getTime() + 2 * 86400000);
          if (closedAt.getTime() + 365 * 86400000 > Date.now()) continue;
          const { data: folders } = await supabaseAdmin.storage
            .from("trip-photos")
            .list(t.id, { limit: 1000 });
          for (const f of folders ?? []) {
            const { data: files } = await supabaseAdmin.storage
              .from("trip-photos")
              .list(`${t.id}/${f.name}`, { limit: 1000 });
            const paths = (files ?? []).map((x) => `${t.id}/${f.name}/${x.name}`);
            if (paths.length) await supabaseAdmin.storage.from("trip-photos").remove(paths);
          }
          await supabaseAdmin
            .from("trips")
            .update({ photos_purged_at: new Date().toISOString() })
            .eq("id", t.id);
          purged++;
        }
        return Response.json({ purged, postcards });
      },
    },
  },
});
