import { APP_VERSION } from "./app-version";

// Browser error reporting (M0-10 / M0-12). Sends to Sentry when VITE_SENTRY_DSN is set; otherwise
// it only logs. The SDK is loaded on the first report, so it costs nothing until something breaks.
const DSN = import.meta.env["VITE_SENTRY_DSN"] as string | undefined;

let sentry: Promise<typeof import("@sentry/react") | null> | undefined;

function loadSentry() {
  if (!sentry) {
    sentry = DSN
      ? import("@sentry/react").then((Sentry) => {
          Sentry.init({
            dsn: DSN,
            release: APP_VERSION,
            environment: import.meta.env.MODE,
          });
          return Sentry;
        })
      : Promise.resolve(null);
  }
  return sentry;
}

export function reportClientError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  // Loaders and server fns commonly throw a raw Response; String(it) is the opaque
  // "[object Response]", so pull out the status and URL instead.
  const normalized =
    error instanceof Error
      ? error
      : new Error(
          error instanceof Response
            ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
            : String(error),
        );
  console.error(normalized);
  void loadSentry().then((Sentry) =>
    Sentry?.captureException(normalized, {
      tags: { route: window.location.pathname },
      extra: context,
    }),
  );
}
