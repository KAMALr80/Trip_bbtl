import { AppShell } from "@/features/app-shell/AppShell";

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TripJunkies™ — Collect the world with your squad." },
      {
        name: "description",
        content:
          "TripJunkies brings your squad together before, during and after the trip with game nights, daily challenges and a recap worth sharing.",
      },
      { property: "og:title", content: "TripJunkies™ — Collect the world with your squad." },
      {
        property: "og:description",
        content:
          "TripJunkies: game nights before you go, challenges while you're there, and memories after.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AppShell,
});
