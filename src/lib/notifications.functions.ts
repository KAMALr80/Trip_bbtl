import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// "Send me a test" (M4-07): queues a test for the signed-in player (the database checks they have
// a subscription and limits it to one a minute), then sends their due reminders right away
// instead of waiting for the next cron minute.
export const sendTestNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.rpc("queue_test_notification");
    if (error) throw new Error(error.message);
    const { runSender } = await import("@/integrations/push/run.server");
    await runSender(getRequestUrl().origin, context.userId, 20);
    return { sent: true };
  });
