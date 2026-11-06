import { describe, expect, it, vi } from "vitest";
import {
  checkDeleteReauth,
  reauthMethod,
  RECENT_SIGN_IN_SECONDS,
  tripsNeedingNewCaptain,
} from "./account-delete";

const NOW = 1_800_000_000;
const emailUser = {
  sub: "me",
  email: "me@example.com",
  app_metadata: { provider: "email", providers: ["email"] },
  amr: [{ method: "password", timestamp: NOW - 100_000 }],
};
const googleUser = (signedInAgo: number) => ({
  sub: "me",
  email: "me@example.com",
  app_metadata: { provider: "google", providers: ["google"] },
  amr: [{ method: "oauth", timestamp: NOW - signedInAgo }],
});

describe("reauthentication before deleting an account (B-31)", () => {
  it("an account with a password has to give it", async () => {
    const verify = vi.fn(async () => true);
    const r = await checkDeleteReauth(emailUser, undefined, verify, NOW);
    expect(r).toMatchObject({ ok: false, code: "PASSWORD_REQUIRED" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("a wrong password is refused", async () => {
    const r = await checkDeleteReauth(emailUser, "nope", async () => false, NOW);
    expect(r).toMatchObject({ ok: false, code: "WRONG_PASSWORD" });
  });

  it("a password check that fails is a refusal, never a pass", async () => {
    const r = await checkDeleteReauth(
      emailUser,
      "right",
      async () => {
        throw new Error("auth service down");
      },
      NOW,
    );
    expect(r).toMatchObject({ ok: false, code: "WRONG_PASSWORD" });
  });

  it("the right password passes, checked against the session's own email", async () => {
    const verify = vi.fn(async () => true);
    expect(await checkDeleteReauth(emailUser, "right", verify, NOW)).toEqual({ ok: true });
    expect(verify).toHaveBeenCalledWith("me@example.com", "right");
  });

  it("an old session doesn't help an account with a password", async () => {
    const r = await checkDeleteReauth(emailUser, undefined, async () => true, NOW);
    expect(r.ok).toBe(false);
  });

  it("a Google-only account isn't asked for a password it doesn't have", async () => {
    const verify = vi.fn(async () => false);
    expect(await checkDeleteReauth(googleUser(60), undefined, verify, NOW)).toEqual({ ok: true });
    expect(verify).not.toHaveBeenCalled();
  });

  it("but it has to have signed in recently", async () => {
    const stale = googleUser(RECENT_SIGN_IN_SECONDS + 1);
    const r = await checkDeleteReauth(stale, undefined, async () => true, NOW);
    expect(r).toMatchObject({ ok: false, code: "SIGN_IN_AGAIN" });
  });

  it("a session that doesn't say when it signed in counts as old", async () => {
    const r = await checkDeleteReauth(
      { sub: "me", email: "me@example.com", app_metadata: { providers: ["google"] } },
      undefined,
      async () => true,
      NOW,
    );
    expect(r).toMatchObject({ ok: false, code: "SIGN_IN_AGAIN" });
  });

  it("an account with both Google and a password uses the password", () => {
    expect(reauthMethod({ providers: ["google", "email"] })).toBe("password");
    expect(reauthMethod({ provider: "google" })).toBe("fresh_sign_in");
    expect(reauthMethod(undefined)).toBe("fresh_sign_in");
  });

  it("the messages carry a code the screen strips", async () => {
    const r = await checkDeleteReauth(emailUser, undefined, async () => true, NOW);
    expect(r).toMatchObject({ message: expect.stringMatching(/^PASSWORD_REQUIRED: /) });
  });
});

describe("tripsNeedingNewCaptain", () => {
  const me = "me";
  it("finds a trip where this player is Captain and others remain", () => {
    expect(
      tripsNeedingNewCaptain(
        [
          { trip_id: "t1", user_id: me, role: "captain" },
          { trip_id: "t1", user_id: "you", role: "player" },
        ],
        me,
      ),
    ).toEqual(["t1"]);
  });

  it("a Captain alone, or a plain player, is free to go", () => {
    expect(
      tripsNeedingNewCaptain(
        [
          { trip_id: "t1", user_id: me, role: "captain" },
          { trip_id: "t2", user_id: me, role: "player" },
          { trip_id: "t2", user_id: "you", role: "captain" },
        ],
        me,
      ),
    ).toEqual([]);
  });
});
