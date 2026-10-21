import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { savePendingBeta } from "@/lib/pending-beta";

export const Route = createFileRoute("/beta/$code")({
  head: () => ({ meta: [
    { title: "Your Beta Code — TripJunkies" },
    { name: "description", content: "Open your TripJunkies private beta invitation." },
    { property: "og:title", content: "Your Beta Code — TripJunkies" },
    { property: "og:description", content: "You've been invited to the TripJunkies private beta." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: BetaLink,
});
function BetaLink() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  useEffect(() => {
    savePendingBeta(code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8));
    void navigate({ to: "/", replace: true });
  }, [code, navigate]);
  return <div className="min-h-dvh flex items-center justify-center font-display font-extrabold text-2xl text-primary">Opening your beta invite ✈️</div>;
}
