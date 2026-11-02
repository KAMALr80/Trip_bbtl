// M6-05 admin area and M6-06 Test Lab for the new engine.
import { expect, test } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

test("find a trip and archive it from Users & trips", async ({ page }) => {
  const calls = await signInWithMockBackend(page, {
    trip: sampleTrip,
    rpc: {
      is_app_admin: true,
      admin_find_users: [],
      admin_find_trips: [
        {
          id: sampleTrip.id,
          name: "Lisbon Crew",
          destination: "Lisbon, Portugal",
          room: "trip",
          play_mode: "crew",
          start_date: "2026-11-20",
          end_date: "2026-11-24",
          members: 4,
          phase: "preflight",
          is_sandbox: false,
          archived: false,
          locked_at: null,
          created_at: "2026-10-01T00:00:00Z",
        },
      ],
      set_trip_archived: null,
    },
  });
  await page.goto("/me");
  await page.getByRole("button", { name: /Users & trips/ }).click();
  await page.getByLabel("Name, email, trip name or join code").fill("Lisbon");
  await page.getByRole("button", { name: "Find" }).click();
  await page.getByRole("button", { name: "Archive" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "set_trip_archived")?.body)
    .toEqual({ p_trip: sampleTrip.id, p_archived: true, p_note: "admin area" });
});

test("Test Lab makes a new-engine sandbox for a room and mode", async ({ page }) => {
  const calls = await signInWithMockBackend(page, {
    trip: sampleTrip,
    rpc: { is_app_admin: true, lab_engine_create: sampleTrip.id },
  });
  await page.goto("/me?view=lab");
  const lab = page.getByRole("region", { name: "New engine sandbox" });
  await lab.getByLabel("Room").selectOption("window_seat");
  await lab.getByLabel("Who's playing").selectOption("solo");
  await lab.getByRole("button", { name: "Create sandbox" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "lab_engine_create")?.body)
    .toEqual({ p_room: "window_seat", p_mode: "solo", p_size: 4, p_days: 5 });
});
