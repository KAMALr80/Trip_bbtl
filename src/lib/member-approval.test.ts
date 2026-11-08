import { describe, expect, it } from "vitest";
import { canApproveMember } from "./member-approval";

describe("canApproveMember (QA-05)", () => {
  it("the Captain can approve anyone", () => {
    for (const age of ["21+", "18–20", "Teen 13–17", "Unknown", null])
      expect(canApproveMember("captain", age)).toBe(true);
  });

  it("the Co-Captain can approve adults", () => {
    expect(canApproveMember("co_captain", "21+")).toBe(true);
    expect(canApproveMember("co_captain", "18–20")).toBe(true);
  });

  it("the Co-Captain can't approve under 18 or an unknown age, as on the server", () => {
    for (const age of ["Teen 13–17", "Unknown", null, undefined])
      expect(canApproveMember("co_captain", age)).toBe(false);
  });

  it("nobody else can approve", () => {
    expect(canApproveMember("player", "21+")).toBe(false);
    expect(canApproveMember("", "21+")).toBe(false);
  });
});
