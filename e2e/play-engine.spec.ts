// M2-09: Play and the phase banner run on the phase engine, for every room.
import { expect, test } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const rail = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Trip phases" });

test("Pre-Flight: banner, the four phases, and call nights with Join call", async ({ page }) => {
  const trip = { ...sampleTrip, start_date: day(5), end_date: day(9), preflight_days: 10 };
  await signInWithMockBackend(page, {
    trip,
    tables: {
      call_nights: [
        {
          id: "00000000-0000-4000-8000-0000000000c1",
          trip_id: trip.id,
          starts_at: new Date(Date.now() + 2 * 86400000).toISOString(),
          call_link: "https://meet.example/crew",
          second_link: null,
        },
      ],
    },
  });
  await page.goto(`/t/${trip.id}/play`);
  await expect(page.getByText("Now boarding. Your trip starts here.").first()).toBeVisible();
  await expect(rail(page).getByRole("button")).toHaveText([
    /Pre-Flight/,
    /Takeoff/,
    /Trip Season/,
    /Baggage Claim/,
  ]);
  await expect(rail(page).getByRole("button", { name: /Pre-Flight/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await rail(page)
    .getByRole("button", { name: /Pre-Flight/ })
    .click();
  await expect(page.getByRole("link", { name: "Join call" })).toHaveAttribute(
    "href",
    "https://meet.example/crew",
  );
});

test("Trip Season: welcome banner with the city, and the crowning night", async ({ page }) => {
  const trip = {
    ...sampleTrip,
    start_date: day(-2),
    end_date: day(3),
    arrived_at: new Date(Date.now() - 86400000).toISOString(),
    crowning_at: new Date(Date.now() + 2 * 86400000).toISOString(),
    crowning_place: "The rooftop",
  };
  await signInWithMockBackend(page, { trip });
  await page.goto(`/t/${trip.id}/play`);
  await expect(page.getByText("You've arrived. Welcome to Lisbon.").first()).toBeVisible();
  await expect(rail(page).getByRole("button", { name: /Trip Season/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await rail(page)
    .getByRole("button", { name: /Trip Season/ })
    .click();
  await expect(page.getByRole("region", { name: "Crowning night" })).toContainText("The rooftop");
});

test("Takeoff: the Captain can tap We've arrived", async ({ page }) => {
  const trip = {
    ...sampleTrip,
    start_date: day(0),
    end_date: day(4),
    home_timezone: "UTC",
    trip_timezone: "UTC",
  };
  const calls = await signInWithMockBackend(page, { trip });
  await page.goto(`/t/${trip.id}/play`);
  await expect(page.getByText("Get ready for takeoff. Seatbelts on.").first()).toBeVisible();
  await page.getByRole("button", { name: "We've arrived" }).first().click();
  await expect.poll(() => calls.some((c) => c.fn === "mark_arrived")).toBe(true);
});

test("an at-home room gets the same Play, with Home Missions (beta note: Play was empty)", async ({
  page,
}) => {
  const trip = {
    ...sampleTrip,
    room: "explore_culture",
    kind: "at_home",
    destination: "Japan",
    cultures: ["JP"],
    start_date: day(3),
    end_date: day(5),
    preflight_days: 4,
  };
  await signInWithMockBackend(page, { trip });
  await page.goto(`/t/${trip.id}/play`);
  await expect(rail(page).getByRole("button")).toHaveText([
    /Pre-Flight/,
    /Home Missions/,
    /Trip Season/,
    /Baggage Claim/,
  ]);
  await expect(page.getByText("Now boarding. Your trip starts here.").first()).toBeVisible();
});
