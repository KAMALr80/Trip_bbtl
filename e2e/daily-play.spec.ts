// M3-04: today's Daily Discovery on Home takes one tap and shows the points the server gave.
import { expect, test } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

const hourAgo = new Date(Date.now() - 3600_000).toISOString();
const later = new Date(Date.now() + 6 * 3600_000).toISOString();

test("Daily Discovery: answer a question day on Home", async ({ page }) => {
  const calls = await signInWithMockBackend(page, {
    trip: sampleTrip,
    rpc: {
      my_schedule: [
        {
          id: "00000000-0000-4000-8000-0000000000d1",
          kind: "daily_discovery",
          slot: "today",
          user_id: null,
          day: hourAgo.slice(0, 10),
          opens_at: hourAgo,
          closes_at: later,
          ref_id: null,
          variant: "question",
          points: 2,
          is_open: true,
          title: "Your first stop",
          body: "What would you try first in Lisbon?",
          insight: null,
          choices: ["Street food", "A cooking class"],
          items: [],
        },
      ],
      answer_daily: [{ points: 1, correct: null, answer: null }],
    },
  });
  await page.goto("/home");
  const card = page.getByLabel(/Daily Discovery/);
  await expect(card.getByText("What would you try first in Lisbon?")).toBeVisible();
  await card.getByRole("button", { name: "Street food" }).click();
  await expect(card.getByRole("status")).toContainText("+1 pt");
  expect(calls.find((c) => c.fn === "answer_daily")?.body).toEqual({
    p_item: "00000000-0000-4000-8000-0000000000d1",
    p_choice: 0,
  });
});
