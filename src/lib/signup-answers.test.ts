import { describe, expect, it } from "vitest";
import { LEGAL_VERSION } from "./legal";
import { isUnder18, recordSignupAnswers, signupAnswers } from "./signup-answers";

describe("signupAnswers", () => {
  it("reads a complete current-version sign-up", () => {
    expect(signupAnswers({ legal_version: LEGAL_VERSION, birthday: "1990-04-02" })).toEqual({
      dob: "1990-04-02",
      teenInvite: null,
    });
  });
  it("keeps a 10-letter teen invite", () => {
    expect(
      signupAnswers({
        legal_version: LEGAL_VERSION,
        birthday: "2010-01-01",
        teen_invite: "ABCDEFGHJK",
      })?.teenInvite,
    ).toBe("ABCDEFGHJK");
  });
  it("asks again for an older Terms version, a missing or malformed birthday, or no metadata", () => {
    expect(signupAnswers({ legal_version: "2020-01-01", birthday: "1990-04-02" })).toBeNull();
    expect(signupAnswers({ legal_version: LEGAL_VERSION })).toBeNull();
    expect(signupAnswers({ legal_version: LEGAL_VERSION, birthday: "02/04/1990" })).toBeNull();
    expect(signupAnswers({ legal_version: LEGAL_VERSION, birthday: "1990-13-45" })).toBeNull();
    expect(signupAnswers(null)).toBeNull();
  });
});

describe("isUnder18", () => {
  const today = new Date(2026, 10, 8);
  it("turns 18 on the birthday itself", () => {
    expect(isUnder18("2008-11-08", today)).toBe(false);
    expect(isUnder18("2008-11-09", today)).toBe(true);
  });
});

describe("recordSignupAnswers", () => {
  const calls: [string, object][] = [];
  const rpc = (fn: string, args: object) => {
    calls.push([fn, args]);
    return Promise.resolve({ error: null });
  };
  it("accepts the Terms, then saves an adult birthday", async () => {
    calls.length = 0;
    expect(await recordSignupAnswers(rpc, { dob: "1990-04-02", teenInvite: null })).toBe(true);
    expect(calls.map((c) => c[0])).toEqual(["accept_legal", "set_my_dob"]);
  });
  it("saves a teen birthday through the invite", async () => {
    calls.length = 0;
    await recordSignupAnswers(rpc, { dob: "2012-01-01", teenInvite: "ABCDEFGHJK" });
    expect(calls[1]).toEqual([
      "set_teen_dob",
      { p_dob: "2012-01-01", p_agree: true, p_invite: "ABCDEFGHJK" },
    ]);
  });
  it("counts the Terms as recorded even if the birthday is refused, which its own screen asks again", async () => {
    const dobFails = (fn: string) =>
      Promise.resolve({ error: fn === "accept_legal" ? null : new Error("Check your birthday") });
    expect(await recordSignupAnswers(dobFails, { dob: "1990-04-02", teenInvite: null })).toBe(true);
  });
  it("stops if the Terms can't be recorded, so the screens still ask", async () => {
    calls.length = 0;
    const failing = (fn: string, args: object) => {
      calls.push([fn, args]);
      return Promise.resolve({ error: new Error("offline") });
    };
    expect(await recordSignupAnswers(failing, { dob: "1990-04-02", teenInvite: null })).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
