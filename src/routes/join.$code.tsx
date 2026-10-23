import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { savePendingCode } from "@/lib/pending-code";

export const Route = createFileRoute("/join/$code")({
  head: () => ({
    meta: [
      { title: "Join a Trip — TripJunkies" },
      { name: "description", content: "Open your TripJunkies invitation and join your trip." },
      { property: "og:title", content: "Join a Trip — TripJunkies" },
      { property: "og:description", content: "You've been invited to a trip on TripJunkies." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JoinLink,
});
function JoinLink() {
  const { code } = Route.useParams();
  const { loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    savePendingCode(code.toUpperCase());
    void navigate({ to: "/", replace: true });
  }, [code, loading, navigate]);
  return (
    <div className="min-h-dvh flex items-center justify-center font-display font-extrabold text-2xl text-primary">
      Opening your invite 💌
    </div>
  );
}
