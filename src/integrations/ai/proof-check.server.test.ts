import { describe, expect, it } from "vitest";
import { checkProofPhoto, parseVerdict, visionProofChecker } from "./proof-check.server";

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

describe("parseVerdict (M6-01, M6-02)", () => {
  it("reads a clean pass", () => {
    expect(parseVerdict('{"verdict":"pass","reason":"a mural","safety":[]}')).toEqual({
      verdict: "pass",
      reason: "a mural",
      safetyFlags: [],
    });
  });
  it("finds the JSON inside extra words and keeps only known flags", () => {
    const v = parseVerdict(
      'Sure! {"verdict":"fail","reason":"no mural","safety":["Weapons","made_up"]}',
    );
    expect(v).toEqual({ verdict: "fail", reason: "no mural", safetyFlags: ["weapons"] });
  });
  it("anything unexpected is unsure with no flags", () => {
    for (const text of ["", "no json here", "{not json}", '{"verdict":"maybe"}', "[1,2]"])
      expect(parseVerdict(text).verdict).toBe("unsure");
  });
  it("a safety-only check never returns a verdict", () => {
    expect(parseVerdict('{"verdict":"pass","reason":null,"safety":["drugs"]}', false)).toEqual({
      verdict: "unsure",
      reason: null,
      safetyFlags: ["drugs"],
    });
  });
  it("a model error is unsure (the crew decides)", async () => {
    const failing = visionProofChecker({} as never);
    const v = await checkProofPhoto({ challenge: "a mural", photoUrl: "https://x/y.jpg" }, failing);
    expect(v).toEqual({ verdict: "unsure", reason: null, safetyFlags: [] });
  });
});
