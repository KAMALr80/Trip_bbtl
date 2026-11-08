import { describe, expect, it } from "vitest";
import { cleanJoinName, joinNameIsValid } from "./join-name";

describe("join name (N-2)", () => {
  it("tidies spaces and control characters, as the server does", () => {
    expect(cleanJoinName("  Penny   Lane ")).toBe("Penny Lane");
    expect(cleanJoinName("Pen\u0007ny\nLane")).toBe("PennyLane");
  });

  it("needs 2 to 30 characters after tidying", () => {
    expect(joinNameIsValid("")).toBe(false);
    expect(joinNameIsValid("   ")).toBe(false);
    expect(joinNameIsValid(" a ")).toBe(false);
    expect(joinNameIsValid("Al")).toBe(true);
    expect(joinNameIsValid("x".repeat(30))).toBe(true);
    expect(joinNameIsValid("x".repeat(31))).toBe(false);
  });

  it("counts an emoji as one character, like the server", () => {
    expect(joinNameIsValid("😀")).toBe(false);
    expect(joinNameIsValid("😀😀")).toBe(true);
  });
});
