import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Reminder sender (M4-08), called every minute by pg_cron ('send-notifications') with the
// database-held 'notify' cron key, or the platform cron secret.
export const Route = createFileRoute("/api/public/notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (denied) {
          const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
          if (!token) return denied;
          const { data: ok } = await supabaseAdmin.rpc("check_cron_key", {
            p_name: "notify",
            p_key: token,
          });
          if (ok !== true) return new Response("Unauthorized", { status: 401 });
        }
        const { runSender } = await import("@/integrations/push/run.server");
        try {
          return Response.json({ handled: await runSender(new URL(request.url).origin) });
        } catch (error) {
          console.error("notify run failed", error);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
