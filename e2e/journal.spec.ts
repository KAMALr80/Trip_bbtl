// M3-12: tonight's journal on Play — swap the prompt, write, save for 2 points.
import { expect, test } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const iso = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();
const item = "00000000-0000-4000-8000-0000000000c9";

test("Window Seat journal: swap the prompt and save an entry", async ({ page }) => {
  const trip = {
    ...sampleTrip,
    room: "window_seat",
    start_date: day(5),
    end_date: day(9),
    preflight_days: 10,
  };
  const calls = await signInWithMockBackend(page, {
    trip,
    rpc: {
      my_schedule: [
        {
          id: item,
          kind: "journal_prompt",
          slot: day(0),
          user_id: "00000000-0000-4000-8000-000000000001",
          day: day(0),
          opens_at: iso(-1),
          closes_at: iso(12),
          ref_id: null,
          variant: null,
          points: 2,
          is_open: true,
          title: "Best bite",
          body: "Rate today's best bite 1–10.",
          insight: null,
          choices: [],
          items: [],
        },
      ],
      journal_options: [
        { idx: 0, prompt: "Rate today's best bite 1–10." },
        { idx: 1, prompt: "Where did you get lost today?" },
        { idx: 2, prompt: "Best seat you sat in today?" },
      ],
      write_journal: "00000000-0000-4000-8000-0000000000ca",
    },
  });
  await page.goto(`/t/${trip.id}/play`);
  await page
    .getByRole("navigation", { name: "Trip phases" })
    .getByRole("button", { name: /Pre-Flight/ })
    .click();
  const card = page.getByRole("region", { name: "Tonight's journal" });
  await expect(card.getByText("Rate today's best bite 1–10.")).toBeVisible();
  await card.getByRole("button", { name: "Swap prompt" }).click();
  await expect(card.getByText("Where did you get lost today?")).toBeVisible();
  await card.getByLabel("Your entry").fill("Took the wrong tram and found a garden.");
  await card.getByRole("button", { name: "Save entry" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "write_journal")?.body)
    .toEqual({ p_item: item, p_body: "Took the wrong tram and found a garden.", p_choice: 1 });
});
