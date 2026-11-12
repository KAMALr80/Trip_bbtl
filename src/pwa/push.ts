// Turning reminders on and off on this browser (M4-07). The subscription is saved with the
// server (save_push_subscription); the VAPID public key comes from the build (VITE_VAPID_PUBLIC_KEY).
import { rpc } from "@/data/rpc";
import { serviceWorkerRegistration } from "./register";

const VAPID = import.meta.env["VITE_VAPID_PUBLIC_KEY"] as string | undefined;

export type PushState =
  /** This browser can't do push here (no worker, no key, or iPhone Safari outside the installed app). */
  | "unsupported"
  /** The player blocked notifications for the site in the browser's settings. */
  | "blocked"
  | "off"
  | "on";

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function pushState(): Promise<PushState> {
  if (
    typeof window === "undefined" ||
    !VAPID ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    return "unsupported";
  const reg = await serviceWorkerRegistration();
  if (!reg) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return (await reg.pushManager.getSubscription()) ? "on" : "off";
}

/** Asks for permission (call from a tap) and saves the subscription. */
export async function turnOnPush(): Promise<PushState> {
  const reg = await serviceWorkerRegistration();
  if (!reg || !VAPID) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(VAPID),
    }));
  const json = sub.toJSON();
  const { error } = await rpc("save_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.["p256dh"] ?? "",
    p_auth: json.keys?.["auth"] ?? "",
    p_user_agent: navigator.userAgent.slice(0, 400),
  });
  if (error) throw error;
  return "on";
}

/**
 * Signing out: the browser drops its subscription, so the last player's reminders stop arriving on
 * this device. The session may already be gone, so the server isn't asked; it deletes the row when
 * the push service answers "gone" on the next send (finish_notifications). Reminders stay off here
 * until a player turns them on again.
 */
export async function releasePushOnThisDevice() {
  if (typeof window === "undefined" || !("PushManager" in window)) return;
  const reg = await serviceWorkerRegistration();
  const sub = await reg?.pushManager.getSubscription();
  await sub?.unsubscribe();
}

export async function turnOffPush(): Promise<PushState> {
  const reg = await serviceWorkerRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await rpc("delete_push_subscription", { p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
  return "off";
}
