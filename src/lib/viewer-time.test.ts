// M0-11 characterisation: deadlines show in the viewer's zone, with the trip zone as a second
// label when they differ (R-109). Display only; the server never uses the viewer's zone.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { deviceZone, fmtWhen, setViewerZone, viewerZone, zoneLabel } from "./viewer-time";

const at = "2026-06-12T13:00:00Z";

describe("fmtWhen", () => {
  // fmtWhen formats in the viewer's own locale (Intl's default). Pin that default to en-US here so
  // the expected text doesn't depend on the machine running the tests (en-GB prints "21:00"); ICU
  // ignores LANG/LC_ALL on Windows, so this can't be set from the environment.
  const RealDateTimeFormat = Intl.DateTimeFormat;
  beforeAll(() => {
    Intl.DateTimeFormat = function (locales?: Intl.LocalesArgument, options?: object) {
      return new RealDateTimeFormat(locales ?? "en-US", options);
    } as typeof Intl.DateTimeFormat;
  });
  afterAll(() => {
    Intl.DateTimeFormat = RealDateTimeFormat;
  });
  afterEach(() => setViewerZone(null));

  it("shows one time when the viewer is in the trip's zone", () => {
    setViewerZone("Asia/Makassar");
    expect(fmtWhen(at, "Asia/Makassar")).not.toContain("your time");
  });

  it("adds the trip's local time when the viewer is elsewhere", () => {
    setViewerZone("America/Los_Angeles");
    const text = fmtWhen(at, "Asia/Makassar");
    expect(text).toContain("6:00");
    expect(text).toMatch(/your time · 9:00\s?PM Central Indonesia$/);
  });

  it("falls back to the device zone when the saved zone is invalid", () => {
    setViewerZone("Not/AZone");
    expect(viewerZone()).toBe(deviceZone());
  });
});

describe("zoneLabel", () => {
  it("prefers the readable zone name", () => {
    expect(zoneLabel("America/New_York")).toBe("Eastern");
  });
});
