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

describe("deliver: failures and repeats (B-30)", () => {
  const sub = (n: number) => ({
    endpoint: `https://push.example.com/${n}`,
    p256dh: "k",
    auth: "a",
  });
  const many = {
    ...base,
    id: "00000000-0000-4000-8000-00000000abcd",
    subscriptions: [sub(1), sub(2), sub(3)],
  };

  it("one browser working is a success, and a gone one is cleaned up", async () => {
    const r = await deliver(many, {
      push: async (s) =>
        s.endpoint.endsWith("/1")
          ? { ok: true }
          : s.endpoint.endsWith("/2")
            ? { ok: false, gone: true, status: 410 }
            : { ok: false, gone: false, status: 503, error: "busy" },
      email: null,
    });
    expect(r).toEqual({
      id: many.id,
      outcome: "sent",
      channel: "push",
      gone: ["https://push.example.com/2"],
    });
  });

  it("every browser failing is retried, with the gone ones still cleaned up", async () => {
    const r = await deliver(many, {
      push: async (s) =>
        s.endpoint.endsWith("/2")
          ? { ok: false, gone: true, status: 410 }
          : { ok: false, gone: false, status: 0, error: "network" },
      email: null,
    });
    expect(r).toMatchObject({ outcome: "retry", gone: ["https://push.example.com/2"] });
  });

  it("every browser gone isn't retried", async () => {
    const r = await deliver(many, {
      push: async () => ({ ok: false, gone: true, status: 404 }),
      email: null,
    });
    expect(r).toMatchObject({ outcome: "skipped" });
    expect(r.gone).toHaveLength(3);
  });

  it("a resend uses the same Topic, so the push service replaces an undelivered copy", async () => {
    const topics: string[] = [];
    const send = {
      push: async (_s: unknown, _p: unknown, topic: string) => (
        topics.push(topic),
        { ok: true as const }
      ),
      email: null,
    };
    await deliver({ ...many, subscriptions: [sub(1)] }, send);
    await deliver({ ...many, subscriptions: [sub(1)], attempts: 2 } as typeof many, send);
    expect(topics[0]).toBe(topics[1]);
    expect(topics[0]).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
  });
});

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
