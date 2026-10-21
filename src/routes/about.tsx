import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AboutContent } from "@/components/AboutStory";

// A shareable address for the founder's story, so it can be sent as a link
// without the reader hitting the sign-in screen first. Same content as
// Me › About TripJunkies — one component, three places.
export const Route = createFileRoute("/about")({
  head: () => {
    const title = "Our Story | TripJunkies™";
    const description =
      "Why TripJunkies exists: turn the weeks before takeoff into game nights, so every squad feels like family before the trip starts.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: AboutPage,
});

function AboutPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh mx-auto max-w-lg px-[18px] pb-16 pt-6 text-foreground">
      <AboutContent onBack={() => void navigate({ to: "/" })} backLabel="TripJunkies™" />
    </div>
  );
}
