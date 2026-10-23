// The signed-in app shell (M1-04). A pathless layout, so the shell stays mounted while the tab
// routes below change: tabs are URLs (/home, /play, /trip, /me; "/" is Home) and sub-screens are
// search params (see src/features/app-shell/nav.ts). Sign-in, onboarding and invites also start
// here, so invite links keep returning to "/".
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/features/app-shell/AppShell";
import { validateShellSearch } from "@/features/app-shell/nav";

export const Route = createFileRoute("/_shell")({
  validateSearch: validateShellSearch,
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
