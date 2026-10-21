/** Shown on bug reports so the founder knows which release a player was on. Bump each round. */
export const APP_VERSION = "beta-r24";

/** Short device label from the browser's user agent (no fingerprinting, just a readable hint). */
export function deviceLabel(ua: string | null | undefined) {
  if (!ua) return "Unknown device";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "Mac"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "Other";
  const br =
    /CriOS|Chrome\//.test(ua) && !/Edg\//.test(ua)
      ? "Chrome"
      : /Edg\//.test(ua)
        ? "Edge"
        : /FxiOS|Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  return `${os} · ${br}${/Mobile/.test(ua) ? " · phone" : ""}`;
}
