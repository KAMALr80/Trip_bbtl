import { describe, expect, it } from "vitest";
import { installPlatform, shouldOfferInstall } from "./install-rules";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const DESKTOP_FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";

describe("installPlatform", () => {
  it("uses the browser's own prompt when it offers one", () => {
    expect(installPlatform(ANDROID_CHROME, true)).toBe("prompt");
  });
  it("explains Add to Home Screen in iPhone Safari only", () => {
    expect(installPlatform(IPHONE_SAFARI, false)).toBe("ios");
    expect(installPlatform(IPHONE_CHROME, false)).toBe("none");
  });
  it("offers nothing where the browser can't install", () => {
    expect(installPlatform(DESKTOP_FIREFOX, false)).toBe("none");
    expect(installPlatform(ANDROID_CHROME, false)).toBe("none");
  });
});

describe("shouldOfferInstall", () => {
  const day = 86_400_000;
  const now = Date.UTC(2026, 10, 1, 12);
  const base = {
    platform: "ios" as const,
    standalone: false,
    inATrip: true,
    dismissedAt: null,
    nextTripStart: now + 20 * day,
    now,
  };

  it("offers it once the player is in a trip", () => {
    expect(shouldOfferInstall(base)).toBe(true);
    expect(shouldOfferInstall({ ...base, inATrip: false })).toBe(false);
  });

  it("never in the installed app or a browser that can't install", () => {
    expect(shouldOfferInstall({ ...base, standalone: true })).toBe(false);
    expect(shouldOfferInstall({ ...base, platform: "none" })).toBe(false);
  });

  it("after Not now, asks again only in the 3 days before the trip", () => {
    const dismissed = { ...base, dismissedAt: now - 5 * day };
    expect(shouldOfferInstall(dismissed)).toBe(false);
    const soon = { ...dismissed, nextTripStart: now + 2 * day };
    expect(shouldOfferInstall(soon)).toBe(true);
    // Dismissed again inside that window: not again for this trip.
    expect(shouldOfferInstall({ ...soon, dismissedAt: now - 3600_000 })).toBe(false);
    expect(shouldOfferInstall({ ...dismissed, nextTripStart: null })).toBe(false);
  });
});
