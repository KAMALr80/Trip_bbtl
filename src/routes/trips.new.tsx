// Captain setup wizard (M2-05): /trips/new?step=0..5[&room=…][&trip=…]. Signed-out visitors go to "/".
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { TripWizard, type WizardSearch } from "@/features/setup/TripWizard";
import { roomIds, type RoomId } from "@/features/trip/rooms";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/trips/new")({
  validateSearch: (raw: Record<string, unknown>): WizardSearch => {
    const out: WizardSearch = {};
    const step = Number(raw["step"]);
    if (Number.isInteger(step) && step >= 0 && step <= 5) out.step = step as WizardSearch["step"];
    if (typeof raw["room"] === "string" && (roomIds as readonly string[]).includes(raw["room"]))
      out.room = raw["room"] as RoomId;
    if (typeof raw["trip"] === "string" && /^[0-9a-f-]{36}$/.test(raw["trip"]))
      out.trip = raw["trip"];
    return out;
  },
  head: () => ({ meta: [{ title: "Set up your trip — TripJunkies" }] }),
  component: NewTrip,
});

function NewTrip() {
  const { user, loading } = useAuth();
  const search = Route.useSearch();
  if (loading) return null;
  if (!user) return <Navigate to="/" />;
  return <TripWizard search={search} />;
}
