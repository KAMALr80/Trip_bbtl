// A saved invite is pinned on Home (Trips first layout) and joins only on tap.
import { expect, test } from "@playwright/test";
import { signInWithMockBackend } from "./support/mock-backend";

test("a saved invite is pinned on Home until Join room", async ({ page }) => {
  const calls = await signInWithMockBackend(page, {
    rpc: {
      trip_invite_preview: [
        {
          name: "Lisbon Crew",
          destination: "Lisbon, Portugal",
          motto: null,
          start_date: "2026-12-01",
          end_date: "2026-12-05",
          member_count: 3,
          captain_name: "Casey",
          captain_style: "street",
          captain_seed: "1",
          captain_avatar_url: null,
        },
      ],
    },
  });
  await page.addInitScript(() => {
    localStorage.setItem("squad-pending-code", "LISBONXX");
    localStorage.setItem("squad-pending-code-at", String(Date.now()));
  });
  await page.goto("/home");
  const invite = page.getByLabel("Trip invitation");
  await expect(invite.getByText(/Lisbon/).first()).toBeVisible();
  expect(calls.some((c) => c.fn === "join_trip")).toBe(false);
});
