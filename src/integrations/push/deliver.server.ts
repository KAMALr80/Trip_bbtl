// Delivers claimed reminders (M4-08): Web Push to every browser the player turned reminders on in,
// email as the backup when no push got through and the player wants email (R-812). Pure apart
// from the senders it's given, so it is unit-tested.
import type { PushResult, PushSubscriptionKeys } from "./web-push.server";

export type ClaimedNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  deep_link: string;
  push: boolean;
  email: boolean;
  email_address: string | null;
  subscriptions: PushSubscriptionKeys[];
};

export type DeliveryResult = {
  id: string;
  outcome: "sent" | "retry" | "skipped" | "failed";
  channel?: "push" | "email";
  error?: string;
  /** Endpoints the push service says are gone: deleted by finish_notifications. */
  gone: string[];
};

export type Senders = {
  push:
    | ((sub: PushSubscriptionKeys, payload: PushPayload, topic: string) => Promise<PushResult>)
    | null;
  email: ((to: string, subject: string, text: string, link: string) => Promise<boolean>) | null;
};

/** What the service worker's push event receives. */
export type PushPayload = { title: string; body: string; url: string; tag: string };

export async function deliver(n: ClaimedNotification, send: Senders): Promise<DeliveryResult> {
  const gone: string[] = [];
  let pushTried = false;
  let pushError = "";
  if (n.push && send.push && n.subscriptions.length) {
    pushTried = true;
    const payload: PushPayload = { title: n.title, body: n.body, url: n.deep_link, tag: n.type };
    // Web Push Topics are at most 32 URL-safe characters: the queue row's id without its dashes.
    // Delivery is at-least-once; the Topic and the notification tag collapse a repeat.
    const topic = n.id.replace(/-/g, "").slice(0, 32);
    const results = await Promise.all(n.subscriptions.map((s) => send.push!(s, payload, topic)));
    results.forEach((r, i) => {
      if (!r.ok && r.gone) gone.push(n.subscriptions[i]!.endpoint);
      if (!r.ok && !r.gone) pushError = `push ${r.status}: ${r.error}`;
    });
    if (results.some((r) => r.ok)) return { id: n.id, outcome: "sent", channel: "push", gone };
  }
  if (n.email && send.email && n.email_address) {
    const ok = await send.email(n.email_address, n.title, n.body, n.deep_link);
    if (ok) return { id: n.id, outcome: "sent", channel: "email", gone };
    return { id: n.id, outcome: "retry", error: "email failed", gone };
  }
  // A push service hiccup is worth another try; nowhere to send it is not.
  if (pushTried && pushError) return { id: n.id, outcome: "retry", error: pushError, gone };
  return { id: n.id, outcome: "skipped", error: "no way to reach this player", gone };
}

/** Runs `fn` over `items`, at most `limit` at a time. */
export async function inBatches<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit)
    out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  return out;
}
