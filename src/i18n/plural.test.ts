import { describe, expect, it } from "vitest";
import { i18n } from "@/i18n";

describe("home countdown (QA-15)", () => {
  it("says day for one and days for more", () => {
    expect(i18n.t("home.daysUntil", { count: 1 })).toBe("day until");
    expect(i18n.t("home.daysUntil", { count: 6 })).toBe("days until");
  });
});
