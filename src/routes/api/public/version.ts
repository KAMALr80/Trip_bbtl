import { createFileRoute } from "@tanstack/react-router";
import { APP_VERSION } from "@/lib/app-version";

export const Route = createFileRoute("/api/public/version")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { version: APP_VERSION },
          { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } },
        ),
    },
  },
});
