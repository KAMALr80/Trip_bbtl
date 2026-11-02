import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { useT } from "@/i18n";
import { useAuth } from "@/lib/auth-context";

// A player's Passport Junkie profile as a link (M5-10, R-722). Signed in only: the server shows a
// private profile's avatar, game name and level to anyone who isn't crew. ?trip= adds that trip's
// role and "most excited for" when the viewer is in it too.
export const Route = createFileRoute("/p/$userId")({
  validateSearch: (search: Record<string, unknown>): { trip?: string } => {
    const trip = search["trip"];
    return typeof trip === "string" && /^[0-9a-f-]{36}$/.test(trip) ? { trip } : {};
  },
  head: () => ({ meta: [{ title: "Passport Junkie | TripJunkies™" }] }),
  component: ProfileRoute,
});

function ProfileRoute() {
  const t = useT();
  const { userId } = Route.useParams();
  const { trip } = Route.useSearch();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  if (loading) return null;
  if (!user)
    return (
      <main className="mx-auto max-w-lg px-[18px] py-10 text-center">
        <p className="font-bold">{t("profile.signIn")}</p>
        <Link to="/" className="mt-4 inline-block text-primary underline">
          {t("profile.signInLink")}
        </Link>
      </main>
    );
  return (
    <main className="min-h-dvh">
      <ProfilePage
        userId={userId}
        tripId={trip ?? null}
        onClose={() =>
          window.history.length > 1 ? window.history.back() : void navigate({ to: "/home" })
        }
      />
    </main>
  );
}
