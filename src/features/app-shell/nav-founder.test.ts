import { describe, expect, it } from "vitest";
import { isFounderSection, isFounderView } from "./nav";

describe("founder-only Me pages (QA-12, QA-13)", () => {
  it("marks the founder views", () => {
    for (const v of ["lab", "reports", "feedback"]) expect(isFounderView(v)).toBe(true);
    for (const v of ["help", "bug", "delete", "notifications"])
      expect(isFounderView(v)).toBe(false);
  });
  it("marks the founder sections and leaves player sections open", () => {
    for (const s of ["moderation", "admin-directory", "beta-codes", "ai-guard", "content-admin"])
      expect(isFounderSection(s)).toBe(true);
    for (const s of ["me-passport", "me-trips", "me-settings", "me-explore"])
      expect(isFounderSection(s)).toBe(false);
  });
});
