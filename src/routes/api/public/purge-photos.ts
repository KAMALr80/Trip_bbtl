import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Daily cleanup (pg_cron). Only removes photos from trips closed more than 12 months ago.
// Callers must present the cron secret (platform secret, or the scheduler's server-only key).
export const Route = createFileRoute("/api/public/purge-photos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (denied) {
          const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
          if (!token) return denied;
          const { data: ok } = await supabaseAdmin.rpc("check_cron_key" as never, { p_name: "purge_photos", p_key: token } as never);
          if (ok !== true) return new Response("Unauthorized", { status: 401 });
        }
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
          const closedAt = t.ended_at ? new Date(t.ended_at) : new Date(new Date(`${t.end_date}T00:00:00Z`).getTime() + 2 * 86400000);
          if (closedAt.getTime() + 365 * 86400000 > Date.now()) continue;
          const { data: folders } = await supabaseAdmin.storage.from("trip-photos").list(t.id, { limit: 1000 });
          for (const f of folders ?? []) {
            const { data: files } = await supabaseAdmin.storage.from("trip-photos").list(`${t.id}/${f.name}`, { limit: 1000 });
            const paths = (files ?? []).map((x) => `${t.id}/${f.name}/${x.name}`);
            if (paths.length) await supabaseAdmin.storage.from("trip-photos").remove(paths);
          }
          await supabaseAdmin.from("trips").update({ photos_purged_at: new Date().toISOString() }).eq("id", t.id);
          purged++;
        }
        return Response.json({ purged });
      },
    },
  },
});
