import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const order: string[] = [];
vi.mock("./snapshot", () => ({
  dropSnapshot: vi.fn(async () => {
    order.push("dropSnapshot");
  }),
}));
vi.mock("./outbox", () => ({
  clearOutbox: vi.fn(async () => {
    order.push("clearOutbox");
  }),
}));

const releasePush = vi.fn(async () => undefined);
vi.mock("@/pwa/push", () => ({ releasePushOnThisDevice: releasePush }));

const { forgetAccount } = await import("./forget");

describe("forgetAccount", () => {
  it("leaves nothing of the last account in memory, the snapshot or the outbox", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["profile"], { display_name: "Previous player" });
    queryClient.setQueryData(["trip", "t1", "journal"], [{ body: "private" }]);
    queryClient.getQueryCache().subscribe(() => order.push("cache"));

    forgetAccount(queryClient);
    await vi.waitFor(() => expect(order).toContain("clearOutbox"));

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(queryClient.getQueryData(["profile"])).toBeUndefined();
    // The snapshot stops saving before the cache empties, so the clear can't be written to it.
    expect(order.indexOf("dropSnapshot")).toBeLessThan(order.indexOf("cache"));
    // A shared phone stops receiving this player's reminders (B-21).
    expect(releasePush).toHaveBeenCalledOnce();
  });

  it("a failure to drop the subscription doesn't get in the way of signing out", async () => {
    releasePush.mockRejectedValueOnce(new Error("no worker"));
    const queryClient = new QueryClient();
    queryClient.setQueryData(["profile"], { display_name: "Previous player" });
    expect(() => forgetAccount(queryClient)).not.toThrow();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
