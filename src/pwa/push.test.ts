import { afterEach, describe, expect, it, vi } from "vitest";

const registration = vi.fn();
vi.mock("./register", () => ({ serviceWorkerRegistration: registration }));
vi.mock("@/data/rpc", () => ({ rpc: vi.fn() }));

const { releasePushOnThisDevice } = await import("./push");

describe("releasePushOnThisDevice (B-21)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    registration.mockReset();
  });

  it("drops this browser's subscription, so the last player's reminders stop arriving", async () => {
    vi.stubGlobal("window", { PushManager: class {} });
    const unsubscribe = vi.fn(async () => true);
    registration.mockResolvedValue({
      pushManager: { getSubscription: async () => ({ unsubscribe }) },
    });
    await releasePushOnThisDevice();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("does nothing when reminders were never turned on", async () => {
    vi.stubGlobal("window", { PushManager: class {} });
    registration.mockResolvedValue({ pushManager: { getSubscription: async () => null } });
    await expect(releasePushOnThisDevice()).resolves.toBeUndefined();
  });

  it("does nothing where the browser has no push", async () => {
    vi.stubGlobal("window", {});
    await releasePushOnThisDevice();
    expect(registration).not.toHaveBeenCalled();
  });
});
