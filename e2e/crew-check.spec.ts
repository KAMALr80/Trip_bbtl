// M3-06: the Crew Check card on Play lists the crew's proofs waiting for a 👍.
import { expect, test } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

test("Crew Check: one 👍 approves a crew member's proof", async ({ page }) => {
  const trip = { ...sampleTrip, start_date: day(5), end_date: day(9), preflight_days: 10 };
  const calls = await signInWithMockBackend(page, {
    trip,
    rpc: {
      crew_check: [
        {
          id: "00000000-0000-4000-8000-0000000000e1",
          user_id: "00000000-0000-4000-8000-000000000009",
          schedule_id: "00000000-0000-4000-8000-0000000000e2",
          kind: "sealed_quest",
          title: "Sketch a landmark",
          photo_path: null,
          body: "Drew the tram in 10 minutes",
          ai_status: "not_needed",
          expires_at: new Date(Date.now() + 20 * 3600_000).toISOString(),
          created_at: new Date().toISOString(),
        },
      ],
      approve_proof: true,
    },
  });
  await page.goto(`/t/${trip.id}/play`);
  await page
    .getByRole("navigation", { name: "Trip phases" })
    .getByRole("button", { name: /Pre-Flight/ })
    .click();
  const card = page.getByRole("region", { name: "Crew Check" });
  await expect(card).toContainText("1 to check");
  await expect(card).toContainText("Drew the tram in 10 minutes");
  await card.getByRole("button", { name: /Approve/ }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "approve_proof")?.body)
    .toEqual({ p_proof: "00000000-0000-4000-8000-0000000000e1" });
});
