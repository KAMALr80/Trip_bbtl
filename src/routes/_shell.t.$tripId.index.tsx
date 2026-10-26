// /t/$tripId opens the trip's Play tab.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_shell/t/$tripId/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/t/$tripId/play", params, replace: true });
  },
});
