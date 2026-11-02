// M6-02: report a crew photo from Crew Check; an admin reviews the queue.
import { expect, test, type Page } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const proof = "00000000-0000-4000-8000-0000000000e1";

// Storage hands back a signed link for every path it is asked about.
async function signEverything(page: Page) {
  await page.route("**/storage/v1/object/sign/**", async (route) => {
    const body = route.request().postDataJSON() as { paths?: string[] } | null;
    const paths = body?.paths ?? [];
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        paths.map((path) => ({ path, signedURL: `/object/sign/x/${path}?token=t`, error: null })),
      ),
    });
  });
}

test("a player reports a crew photo from Crew Check", async ({ page }) => {
  const trip = { ...sampleTrip, start_date: day(5), end_date: day(9), preflight_days: 10 };
  const calls = await signInWithMockBackend(page, {
    trip,
    rpc: {
      crew_check: [
        {
          id: proof,
          user_id: "00000000-0000-4000-8000-000000000009",
          schedule_id: "00000000-0000-4000-8000-0000000000e2",
          kind: "sealed_quest",
          title: "Sketch a landmark",
          photo_path: "t/u/i/a.jpg",
          body: null,
          ai_status: "not_needed",
          expires_at: new Date(Date.now() + 20 * 3600_000).toISOString(),
          created_at: new Date().toISOString(),
        },
      ],
      report_proof_photo: null,
    },
  });
  await signEverything(page);
  await page.goto(`/t/${trip.id}/play`);
  await page
    .getByRole("navigation", { name: "Trip phases" })
    .getByRole("button", { name: /Pre-Flight/ })
    .click();
  const card = page.getByRole("region", { name: "Crew Check" });
  await card.getByRole("button", { name: "Report" }).click();
  await card.getByLabel("What's wrong? (optional)").fill("Not from our trip");
  await card.getByRole("button", { name: "Send" }).click();
  await expect(card.getByText("Thanks. A reviewer will look at it.")).toBeVisible();
  await expect
    .poll(() => calls.find((c) => c.fn === "report_proof_photo")?.body)
    .toEqual({ p_proof: proof, p_reason: "Not from our trip" });
});

test("an admin removes a flagged photo from the review queue", async ({ page }) => {
  const calls = await signInWithMockBackend(page, {
    trip: sampleTrip,
    rpc: {
      is_app_admin: true,
      moderation_queue: [
        {
          id: "00000000-0000-4000-8000-0000000000f1",
          proof_id: proof,
          trip_id: sampleTrip.id,
          trip_name: "Lisbon Crew",
          uploader_id: "00000000-0000-4000-8000-000000000009",
          uploader_name: "Pal",
          photo_path: "t/u/i/a.jpg",
          challenge: "A street mural",
          body: null,
          ai_flags: ["weapons"],
          reports: 0,
          report_reasons: [],
          status: "flagged",
          created_at: new Date().toISOString(),
          has_minors: false,
        },
      ],
      moderate_photo: null,
    },
  });
  await signEverything(page);
  await page.goto("/me");
  await page.getByRole("button", { name: /Photo review/ }).click();
  await expect(page.getByText("Safety check: weapons")).toBeVisible();
  await page.getByLabel("Note for the log (optional)").fill("Toy sword, but not for this game");
  await page.getByRole("button", { name: "Remove" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "moderate_photo")?.body)
    .toEqual({
      p_id: "00000000-0000-4000-8000-0000000000f1",
      p_action: "remove",
      p_note: "Toy sword, but not for this game",
    });
});
