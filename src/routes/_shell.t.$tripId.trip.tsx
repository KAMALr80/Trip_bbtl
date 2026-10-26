// Tab route: the _shell layout renders it (src/features/app-shell). URL: /t/$tripId/trip
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_shell/t/$tripId/trip")({});
