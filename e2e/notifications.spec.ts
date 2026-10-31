// M4-07: Me → Notifications lists every reminder type with push / email switches and quiet hours.
import { expect, test } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

const settings = [
  {
    type: "daily",
    label: "Daily Discovery each morning",
    push: true,
    email: false,
    quiet_start: "22:00:00",
    quiet_end: "08:00:00",
  },
  {
    type: "crew_check",
    label: "A crew proof needs your 👍",
    push: true,
    email: false,
    quiet_start: "22:00:00",
    quiet_end: "08:00:00",
  },
];

test("mute a reminder type and change quiet hours", async ({ page }) => {
  const calls = await signInWithMockBackend(page, {
    trip: sampleTrip,
    rpc: { my_notification_settings: settings, set_notification_pref: null, set_quiet_hours: null },
  });
  await page.goto("/me?view=notifications");
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await page.getByRole("switch", { name: "Push: Daily Discovery each morning" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "set_notification_pref")?.body)
    .toEqual({ p_type: "daily", p_push: false, p_email: false });

  const from = page.getByLabel("From");
  await from.fill("23:00");
  await from.blur();
  await expect
    .poll(() => calls.find((c) => c.fn === "set_quiet_hours")?.body)
    .toEqual({ p_start: "23:00", p_end: "08:00" });
});

test("on iPhone Safari outside the installed app, it says to add to the Home Screen first", async ({
  page,
}) => {
  await signInWithMockBackend(page, { rpc: { my_notification_settings: settings } });
  await page.goto("/me?view=notifications");
  await expect(page.getByText(/add TripJunkies to your Home Screen first/)).toBeVisible();
});
