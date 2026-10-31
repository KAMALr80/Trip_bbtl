// One sender run (M4-08): claim due reminders, deliver them, report back. Used by the cron route
// (/api/public/notify, every minute) and by "Send me a test" (for that player only).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deliver, inBatches, type ClaimedNotification, type Senders } from "./deliver.server";
import { sendWebPush } from "./web-push.server";

const BATCH = 50;

/** The senders this environment has keys for. Without VAPID keys nothing is pushed. */
export function senders(origin: string): Senders {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"] || "mailto:support@tripjunkies.app";
  const emailKey = process.env["EMAIL_API_KEY"];
  const emailFrom = process.env["EMAIL_FROM"];
  return {
    push:
      publicKey && privateKey
        ? (sub, payload) => sendWebPush(sub, payload, { publicKey, privateKey, subject })
        : null,
    email:
      emailKey && emailFrom
        ? async (to, subject, text, link) => {
            // Resend's HTTP API (EMAIL_API_KEY); any provider with a JSON send endpoint works here.
            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${emailKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: emailFrom,
                to: [to],
                subject,
                text: `${text}\n\nOpen TripJunkies: ${origin}${link}\n\nChange which reminders you get in Me → Notifications.`,
              }),
            }).catch(() => null);
            return !!res?.ok;
          }
        : null,
  };
}

/** Sends everything due (or one player's due rows). Returns how many were handled. */
export async function runSender(origin: string, userId: string | null = null, max = 1000) {
  const send = senders(origin);
  let handled = 0;
  while (handled < max) {
    const { data, error } = await supabaseAdmin.rpc("claim_notifications", {
      p_limit: Math.min(200, max - handled),
      p_user: userId as string,
    });
    if (error) throw error;
    const rows = (data ?? []) as unknown as ClaimedNotification[];
    if (!rows.length) break;
    const results = await inBatches(rows, BATCH, (n) => deliver(n, send));
    const { error: finishError } = await supabaseAdmin.rpc("finish_notifications", {
      p_results: results as never,
    });
    if (finishError) throw finishError;
    handled += rows.length;
  }
  return handled;
}
