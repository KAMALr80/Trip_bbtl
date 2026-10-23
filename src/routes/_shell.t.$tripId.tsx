// Trip layout (M1-04): /t/$tripId/play and /t/$tripId/trip. The app shell opens the trip named in
// the URL; this loader starts loading its roster and cards while the route changes. Phase and room
// config join them with the M2 phase engine.
import { createFileRoute } from "@tanstack/react-router";
import { prefetchTrip } from "@/data/queries";

export const Route = createFileRoute("/_shell/t/$tripId")({
  loader: ({ context, params }) => prefetchTrip(context.queryClient, params.tripId),
});
