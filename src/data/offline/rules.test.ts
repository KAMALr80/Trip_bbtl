import { describe, expect, it } from "vitest";
import { isNetworkError, keepQuery, lastSynced, syncedAgo } from "./rules";

describe("keepQuery", () => {
  it("keeps my trip list and the trip's own-view queries", () => {
    expect(keepQuery(["trips", "me"], "me")).toBe(true);
    for (const part of ["members", "cards", "schedule", "daily-answers", "call-nights", "crowns"])
      expect(keepQuery(["trip", "t1", part], "me")).toBe(true);
    expect(keepQuery(["trip", "t1", "standings", "trip_season"], "me")).toBe(true);
    expect(keepQuery(["trip", "t1", "standings", "mine", "preflight"], "me")).toBe(true);
  });

  it("leaves out another player's trip list, crew photos, live counts and the guide", () => {
    expect(keepQuery(["trips", "someone-else"], "me")).toBe(false);
    expect(keepQuery(["trip", "t1", "crew-check"], "me")).toBe(false);
    expect(keepQuery(["trip", "t1", "live"], "me")).toBe(false);
    expect(keepQuery(["trip", "t1", "guide"], "me")).toBe(false);
    expect(keepQuery(["live", "s1"], "me")).toBe(false);
    expect(keepQuery(["trip", "", "members"], "me")).toBe(false);
  });
});

describe("isNetworkError", () => {
  it("is true when offline, or when fetch itself failed", () => {
    expect(isNetworkError(null, false)).toBe(true);
    expect(isNetworkError({ name: "AuthRetryableFetchError", message: "x" })).toBe(true);
    expect(isNetworkError({ message: "TypeError: Failed to fetch", code: "" })).toBe(true);
    expect(isNetworkError(new TypeError("Load failed"))).toBe(true); // Safari
    expect(isNetworkError(new TypeError("NetworkError when attempting to fetch resource."))).toBe(
      true,
    );
  });

  it("is false for refusals from the server", () => {
    expect(isNetworkError(null)).toBe(false);
    expect(
      isNetworkError({ name: "AuthSessionMissingError", message: "Auth session missing!" }),
    ).toBe(false);
    expect(isNetworkError({ message: "permission denied for table trips", code: "42501" })).toBe(
      false,
    );
    expect(isNetworkError({ name: "AuthApiError", message: "JWT expired", status: 401 })).toBe(
      false,
    );
  });
});

describe("lastSynced and syncedAgo", () => {
  it("takes the newest load time", () => {
    expect(lastSynced([])).toBe(null);
    expect(lastSynced([{ state: { dataUpdatedAt: 5 } }, { state: { dataUpdatedAt: 9 } }])).toBe(9);
  });

  it("says how long ago", () => {
    const now = Date.UTC(2026, 9, 31, 12);
    expect(syncedAgo(now - 30_000, now, "en")).toBe("this minute");
    expect(syncedAgo(now - 5 * 60_000, now, "en")).toBe("5 minutes ago");
    expect(syncedAgo(now - 2 * 3600_000, now, "en")).toBe("2 hours ago");
    expect(syncedAgo(now - 26 * 3600_000, now, "en")).toBe("yesterday");
  });
});
