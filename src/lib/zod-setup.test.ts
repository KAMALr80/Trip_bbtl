import { describe, expect, it, vi } from "vitest";
import { z } from "./zod-setup";

describe("zod setup (B-28)", () => {
  it("never tries to compile code, so a strict CSP sees no eval", () => {
    const spy = vi.spyOn(globalThis, "Function");
    expect(z.config().jitless).toBe(true);
    expect(z.object({ a: z.string() }).parse({ a: "x" })).toEqual({ a: "x" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
