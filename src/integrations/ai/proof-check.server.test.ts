import { describe, expect, it } from "vitest";
import { checkProofPhoto } from "./proof-check.server";

describe("checkProofPhoto (M3-14)", () => {
  it("the stub leaves every photo to the crew", async () => {
    const v = await checkProofPhoto({ challenge: "a mural", photoUrl: "https://x/y.jpg" });
    expect(v.verdict).toBe("unsure");
  });
  it("a real checker plugs in behind the same interface", async () => {
    const v = await checkProofPhoto(
      { challenge: "a mural", photoUrl: "https://x/y.jpg" },
      async () => ({
        verdict: "pass",
        reason: "mural found",
        safetyFlags: [],
      }),
    );
    expect(v.verdict).toBe("pass");
  });
});
