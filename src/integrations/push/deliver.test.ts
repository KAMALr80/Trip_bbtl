import { describe, expect, it } from "vitest";
import { deliver, type ClaimedNotification, type Senders } from "./deliver.server";

const sub = (n: number) => ({ endpoint: `https://push.example.com/${n}`, p256dh: "k", auth: "a" });
const base: ClaimedNotification = {
  id: "n1",
  type: "daily",
  title: "Daily Discovery",
  body: "Try a pastel de nata",
  deep_link: "/home",
  push: true,
  email: false,
  email_address: "p@example.com",
  subscriptions: [sub(1), sub(2)],
};
const okPush: Senders["push"] = async () => ({ ok: true });

describe("deliver", () => {
  it("sends the push to every browser, with the deep link and type", async () => {
    const seen: unknown[] = [];
    const r = await deliver(base, {
      push: async (s, p) => (seen.push([s.endpoint, p]), { ok: true }),
      email: null,
    });
    expect(r).toEqual({ id: "n1", outcome: "sent", channel: "push", gone: [] });
    expect(seen).toEqual([
      [
        "https://push.example.com/1",
        { title: "Daily Discovery", body: "Try a pastel de nata", url: "/home", tag: "daily" },
      ],
      [
        "https://push.example.com/2",
        { title: "Daily Discovery", body: "Try a pastel de nata", url: "/home", tag: "daily" },
      ],
    ]);
  });

  it("reports gone subscriptions, and counts the push as sent if one browser got it", async () => {
    const r = await deliver(base, {
      push: async (s) =>
        s.endpoint.endsWith("1") ? { ok: false, gone: true, status: 410 } : { ok: true },
      email: null,
    });
    expect(r).toMatchObject({ outcome: "sent", gone: ["https://push.example.com/1"] });
  });

  it("falls back to email when no push got through and the player wants email", async () => {
    let mailed = "";
    const r = await deliver(
      { ...base, email: true },
      {
        push: async () => ({ ok: false, gone: true, status: 410 }),
        email: async (to) => ((mailed = to), true),
      },
    );
    expect(r).toMatchObject({ outcome: "sent", channel: "email" });
    expect(mailed).toBe("p@example.com");
  });

  it("never pushes a muted channel", async () => {
    let pushed = false;
    const r = await deliver(
      { ...base, push: false, email: true },
      { push: async () => ((pushed = true), { ok: true }), email: async () => true },
    );
    expect(pushed).toBe(false);
    expect(r).toMatchObject({ outcome: "sent", channel: "email" });
  });

  it("retries a push service hiccup; skips when there is nowhere to send", async () => {
    expect(
      await deliver(base, {
        push: async () => ({ ok: false, gone: false, status: 503, error: "busy" }),
        email: null,
      }),
    ).toMatchObject({ outcome: "retry" });
    expect(
      await deliver({ ...base, subscriptions: [] }, { push: okPush, email: null }),
    ).toMatchObject({
      outcome: "skipped",
    });
  });
});
