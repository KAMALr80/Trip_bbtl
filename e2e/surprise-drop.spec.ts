// M3-09: a Surprise Drop on Play takes a photo per Bingo square; sealed quests open with a tap.
import { expect, test } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const iso = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();
const base = {
  slot: "x",
  day: day(0),
  ref_id: null,
  insight: null,
  choices: [],
};

test("Surprise Drop Bingo squares and opening a sealed quest", async ({ page }) => {
  const trip = { ...sampleTrip, start_date: day(5), end_date: day(9), preflight_days: 10 };
  const calls = await signInWithMockBackend(page, {
    trip,
    rpc: {
      my_schedule: [
        {
          ...base,
          id: "00000000-0000-4000-8000-0000000000b1",
          kind: "surprise_drop",
          user_id: null,
          opens_at: iso(-1),
          closes_at: iso(20),
          variant: "bingo",
          points: null,
          is_open: true,
          title: "Street bingo",
          body: "Spot these around Lisbon today.",
          items: [
            "a mural",
            "a tram",
            "a cat",
            "a bridge",
            "a fountain",
            "a kite",
            "a dog",
            "a flag",
            "a clock",
          ],
        },
        {
          ...base,
          id: "00000000-0000-4000-8000-0000000000b2",
          kind: "sealed_quest",
          user_id: "00000000-0000-4000-8000-000000000001",
          opens_at: iso(-1),
          closes_at: iso(30),
          variant: null,
          points: 10,
          is_open: true,
          title: null,
          body: null,
          items: [],
        },
      ],
      open_item: true,
    },
  });
  await page.goto(`/t/${trip.id}/play`);
  await page
    .getByRole("navigation", { name: "Trip phases" })
    .getByRole("button", { name: /Pre-Flight/ })
    .click();
  const drop = page.getByRole("region", { name: "Surprise Drop · Bingo" });
  await expect(drop.getByText("Photo for: a mural")).toBeVisible();
  await expect(drop.getByRole("listitem")).toHaveCount(9);
  const quest = page.getByRole("article", { name: /Sealed quest/ });
  await quest.getByRole("button", { name: "Open it" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "open_item")?.body)
    .toEqual({ p_item: "00000000-0000-4000-8000-0000000000b2" });
});
