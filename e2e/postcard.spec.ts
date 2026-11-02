// M5-01 Postcard Picks, M5-02 wrap-up week, M5-12 the after-trip view.
import { expect, test } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const iso = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();
const me = "00000000-0000-4000-8000-000000000001";
const pal = "00000000-0000-4000-8000-000000000002";
const proof = (n: number) => `00000000-0000-4000-8000-0000000005${String(n).padStart(2, "0")}`;
const info = {
  picks: 2,
  kept: 6,
  solo: false,
  picks_close_at: iso(48),
  locks_at: iso(96),
  questions: [
    { key: "never_forget", question: "Moment you'll never forget", emoji: false },
    { key: "emojis", question: "Your trip in 3 emojis", emoji: true },
    { key: "best_bite", question: "Best bite", emoji: false },
  ],
};
const photoRow = (n: number) => ({
  id: proof(n),
  photo_path: `t/${me}/i/${n}.jpg`,
  crew_status: "approved",
  photo_removed_at: null,
  created_at: iso(-n),
});

test("Postcard Picks: nominate my photos during Trip Season", async ({ page }) => {
  const trip = { ...sampleTrip, start_date: day(-2), end_date: day(2), arrived_at: iso(-40) };
  const calls = await signInWithMockBackend(page, {
    trip,
    rpc: { postcard_info: info, pick_postcard: 1 },
    tables: { proofs: [photoRow(1), photoRow(2), photoRow(3)], postcard_picks: [] },
  });
  await page.goto(`/t/${trip.id}/play`);
  await page
    .getByRole("navigation", { name: "Trip phases" })
    .getByRole("button", { name: /Trip Season/ })
    .click();
  const card = page.getByRole("region", { name: "Postcard Picks" });
  await expect(card.getByText("0 of 2 picked")).toBeVisible();
  await card.getByRole("button", { name: "Pick this photo for the postcard" }).first().click();
  await expect
    .poll(() => calls.find((c) => c.fn === "pick_postcard")?.body)
    .toEqual({ p_trip: trip.id, p_proof: proof(1), p_pick: true });
});

test("Wrap-up week: heart a crew pick and answer in exactly 3 emojis", async ({ page }) => {
  const trip = { ...sampleTrip, start_date: day(-6), end_date: day(-2), arrived_at: iso(-140) };
  const calls = await signInWithMockBackend(page, {
    trip,
    rpc: {
      postcard_info: info,
      wrapup_board: [
        {
          proof_id: proof(7),
          user_id: pal,
          photo_path: "p/7.jpg",
          mine: false,
          hearted: false,
          picked_at: iso(-50),
        },
        {
          proof_id: proof(8),
          user_id: me,
          photo_path: "p/8.jpg",
          mine: true,
          hearted: false,
          picked_at: iso(-50),
        },
      ],
      heart_photo: true,
      answer_wrapup: null,
    },
    tables: { wrapup_answers: [], proofs: [] },
  });
  await page.goto(`/t/${trip.id}/play`);
  await page
    .getByRole("navigation", { name: "Trip phases" })
    .getByRole("button", { name: /Baggage Claim/ })
    .click();
  const card = page.getByRole("region", { name: "Wrap-up week" });
  // Only the crew's photo can be hearted, not my own.
  await expect(card.getByRole("button", { name: "Heart this photo" })).toHaveCount(1);
  await card.getByRole("button", { name: "Heart this photo" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "heart_photo")?.body)
    .toEqual({ p_trip: trip.id, p_proof: proof(7), p_on: true });

  const emoji = card.getByLabel("Your trip in 3 emojis");
  await emoji.fill("🌊🍝");
  await expect(card.getByText("Use exactly 3 emojis.")).toBeVisible();
  await emoji.fill("🌊🍝🇵🇹");
  await emoji.press("Enter");
  await expect
    .poll(() => calls.find((c) => c.fn === "answer_wrapup")?.body)
    .toEqual({ p_trip: trip.id, p_key: "emojis", p_answer: "🌊🍝🇵🇹" });
});

test("After the Day 7 lock the trip shows its postcard only", async ({ page }) => {
  const trip = {
    ...sampleTrip,
    start_date: day(-14),
    end_date: day(-10),
    locked_at: iso(-20),
  };
  await signInWithMockBackend(page, {
    trip,
    tables: {
      trip_postcards: [
        {
          trip_id: trip.id,
          locked_at: iso(-20),
          photos: [{ proof_id: proof(7), path: "p/7.jpg", user_id: pal, hearts: 2 }],
          answers: [
            {
              key: "never_forget",
              question: "Moment you'll never forget",
              answers: ["Fado at midnight"],
            },
          ],
          crowns: [{ season: "trip_season", user_id: pal, name: "Pal", points: 40, solo: false }],
          excited: ["Pastéis de nata"],
        },
      ],
    },
  });
  await page.goto(`/t/${trip.id}/trip`);
  await expect(page.getByText("Trip complete")).toBeVisible();
  const postcard = page.getByRole("region", { name: "Trip Postcard" });
  await expect(postcard.getByText("Fado at midnight")).toBeVisible();
  await expect(postcard.getByText("👑 Jet Setter: Pal")).toBeVisible();
  await expect(postcard.getByRole("button", { name: /Download or share/ })).toBeVisible();
});

test("Passport: the server's level, a badge tier-up once, and a stamp opens its postcard", async ({
  page,
}) => {
  const trip = { ...sampleTrip, start_date: day(-14), end_date: day(-10), locked_at: iso(-20) };
  const calls = await signInWithMockBackend(page, {
    trip,
    rpc: {
      my_passport_progress: {
        countries: 3,
        level: "explorer",
        stars: 0,
        next_at: 5,
        badges: [{ badge: "us_explorer", tier: 1, progress: 2, earned_at: iso(-20), new: true }],
      },
      my_stamps: [
        {
          trip_id: trip.id,
          kind: "international",
          country: "Portugal",
          state: null,
          city: "Lisbon",
          culture: null,
          stamped_on: day(-10),
          season_label: "Fall 2026",
          room: "trip",
          solo: false,
          crowns: ["trip_season"],
          trip_name: "Lisbon Crew",
          has_postcard: true,
          squad_count: 4,
        },
      ],
      mark_badges_seen: null,
    },
    tables: {
      trip_postcards: [
        {
          trip_id: trip.id,
          locked_at: iso(-20),
          photos: [],
          answers: [{ key: "song", question: "Song of the trip", answers: ["Lisboa Menina"] }],
          crowns: [],
          excited: [],
        },
      ],
    },
  });
  await page.goto("/me");
  await page.getByRole("button", { name: /Open my passport/ }).click();
  await expect(page.getByLabel("Level: Explorer").first()).toBeVisible();
  await expect(page.getByText("U.S. Explorer: Carry-On!")).toBeVisible();
  await expect.poll(() => calls.some((c) => c.fn === "mark_badges_seen")).toBe(true);
  await page.getByRole("button", { name: "Open the postcard for Lisbon Crew" }).click();
  await expect(page.getByRole("dialog").getByText("Lisboa Menina")).toBeVisible();
});
