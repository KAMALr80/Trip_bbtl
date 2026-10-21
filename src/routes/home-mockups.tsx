import { createFileRoute } from "@tanstack/react-router";
import { HomeLayoutMockups } from "@/components/HomeLayoutMockups";

export const Route = createFileRoute("/home-mockups")({
  head: () => ({
    meta: [
      { title: "Home layout mockups — TripJunkies" },
      { name: "description", content: "Sample-only Home layout comparison for TripJunkies." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Home layout mockups — TripJunkies" },
      { property: "og:description", content: "Sample-only Home layout comparison." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <div className="min-h-screen px-4 py-6"><HomeLayoutMockups standalone /></div>,
});
