import { describe, expect, it } from "vitest";
import en from "./en.json";
import { detectLanguage, t } from "./index";

function leaves(node: unknown, path = ""): [string, unknown][] {
  if (node && typeof node === "object")
    return Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  return [[path, node]];
}

describe("i18n", () => {
  it("falls back to English for languages we don't ship yet", () => {
    expect(detectLanguage(["es-MX", "en-US"])).toBe("en");
    expect(detectLanguage(["es"])).toBe("en");
    expect(detectLanguage(undefined)).toBe("en");
  });

  it("reads keys and fills placeholders", () => {
    expect(t("nav.Play")).toBe("Play");
    expect(t("verify.resendIn", { seconds: 42 })).toBe("Resend code in 42s");
  });

  it("has no empty strings in the English catalog", () => {
    for (const [key, value] of leaves(en)) {
      expect(typeof value, key).toBe("string");
      expect((value as string).trim(), key).not.toBe("");
    }
  });
});
