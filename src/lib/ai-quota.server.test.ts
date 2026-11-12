import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const eq = vi.fn(async () => ({ error: null }));
const update = vi.fn(() => ({ eq }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc, from: vi.fn(() => ({ update })) },
}));

const { logAppAi, reserveAppAi } = await import("./ai-quota.server");

describe("app-paid AI reservations (B-29)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reserves before the call and returns the row", async () => {
    rpc.mockResolvedValue({ data: "usage-1", error: null });
    expect(await reserveAppAi("proof_check", "trip-1", "user-1")).toBe("usage-1");
    expect(rpc).toHaveBeenCalledWith("ai_reserve_server", {
      p_kind: "proof_check",
      p_trip: "trip-1",
      p_user: "user-1",
    });
  });

  it("a cap or the kill switch means no call", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await reserveAppAi("proof_check", null, "user-1")).toBeNull();
  });

  it("fails closed when the database errors or throws", async () => {
    rpc.mockResolvedValueOnce({ data: "usage-1", error: { message: "boom" } });
    expect(await reserveAppAi("proof_check", null, null)).toBeNull();
    rpc.mockRejectedValueOnce(new Error("network"));
    expect(await reserveAppAi("proof_check", null, null)).toBeNull();
  });

  it("records tokens and cost on the reserved row", async () => {
    await logAppAi("usage-1", "model-x", { inputTokens: 1000, outputTokens: 100 });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ model: "model-x", input_tokens: 1000, output_tokens: 100 }),
    );
    expect(eq).toHaveBeenCalledWith("id", "usage-1");
  });

  it("a logging failure never breaks the feature", async () => {
    update.mockImplementationOnce(() => {
      throw new Error("db down");
    });
    await expect(logAppAi("usage-1", "m", undefined)).resolves.toBeUndefined();
  });
});
