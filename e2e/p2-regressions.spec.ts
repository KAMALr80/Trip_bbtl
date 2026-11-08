// Regression tests for the post-merge QA findings QA-01, 02, 03, 04, 05, 08 and 09, against the
// mocked backend. The phase comes from the mocked trip_phase, so these prove the screens follow the
// server's answer rather than the trip's dates. The real stack is covered by the gameplay QA run.
import { expect, test, type Page } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const noScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const phaseRpc = (phase: string) => ({
  trip_phase: [{ phase, phase_starts_at: null, phase_ends_at: null, tz: "UTC", day_index: 1 }],
});
const finished = {
  ...sampleTrip,
  id: "00000000-0000-4000-8000-0000000000b1",
  name: "Old Finished Trip",
  destination: "Mexico City, Mexico",
  start_date: day(-40),
  end_date: day(-30),
};
const member = (tripId: string, role = "captain") => ({
  trip_id: tripId,
  user_id: "00000000-0000-4000-8000-000000000001",
  role,
  status: "approved",
});

test.describe("QA-01: the trips list fits a phone", () => {
  for (const width of [360, 390]) {
    test.describe(`${width} px`, () => {
      test.use({ viewport: { width, height: 740 } });
      for (const path of ["/me?section=me-trips", "/home?screen=journey"]) {
        test(`${path}: no sideways scroll, Options on screen`, async ({ page }) => {
          await signInWithMockBackend(page, {
            trip: sampleTrip,
            tables: {
              trips: [finished, sampleTrip],
              trip_members: [member(finished.id), member(sampleTrip.id)],
            },
          });
          await page.goto(path);
          const options = page.getByRole("button", { name: `Options for ${finished.name}` });
          await expect(options).toBeVisible();
          await options.scrollIntoViewIfNeeded();
          const box = (await options.boundingBox())!;
          expect(box.x + box.width).toBeLessThanOrEqual(width);
          expect(await noScroll(page)).toBeLessThanOrEqual(1);
          await expect(page.getByText(/Add your home country/).first()).toBeVisible();
        });
      }
    });
  }
});

test.describe("QA-02: the Home banner follows the server's phase", () => {
  const banners: [string, string | null][] = [
    ["setup", null],
    ["upcoming", null],
    ["preflight", "Now boarding. Your trip starts here."],
    ["takeoff", "Get ready for takeoff. Seatbelts on."],
    ["trip_season", "You've arrived. Welcome to Lisbon."],
    ["baggage_claim", "Thank you for flying with us. Collect your memories."],
    ["archived", null],
  ];
  for (const [phase, text] of banners) {
    test(`${phase}`, async ({ page }) => {
      // The trip's dates say "20 days away"; only the server's answer can give these banners.
      await signInWithMockBackend(page, { trip: sampleTrip, rpc: phaseRpc(phase) });
      await page.goto("/");
      await expect(page.getByRole("heading", { name: /Where to/ })).toBeVisible();
      if (text) await expect(page.getByRole("status").getByText(text)).toBeVisible();
      await page.waitForTimeout(500);
      await expect(page.getByText(/Takeoff is underway/)).toHaveCount(0);
      if (!text)
        await expect(
          page.getByRole("status").filter({ hasText: /boarding|takeoff|arrived|flying/i }),
        ).toHaveCount(0);
    });
  }

  test("an at-home room gets start-day copy, not flight copy", async ({ page }) => {
    await signInWithMockBackend(page, {
      trip: { ...sampleTrip, kind: "at_home", room: "explore_culture" },
      rpc: phaseRpc("takeoff"),
    });
    await page.goto("/");
    await expect(page.getByText("Your start-day missions are open.")).toBeVisible();
  });

  test("with no answer from the server the display mirror is used", async ({ page }) => {
    await signInWithMockBackend(page, {
      trip: { ...sampleTrip, start_date: day(2), end_date: day(5) },
    });
    await page.goto("/");
    await expect(page.getByText("Now boarding. Your trip starts here.")).toBeVisible();
  });
});

test.describe("QA-03: which trip opens", () => {
  const other = {
    ...sampleTrip,
    id: "00000000-0000-4000-8000-0000000000b2",
    name: "Far Later Trip",
    start_date: day(90),
    end_date: day(95),
  };
  const both = (...trips: (typeof sampleTrip)[]) => ({
    trip: sampleTrip,
    tables: { trips, trip_members: trips.map((t) => member(t.id)) },
  });

  test("the upcoming trip opens, not the older finished one", async ({ page }) => {
    await signInWithMockBackend(page, both(finished, sampleTrip));
    await page.goto("/play");
    await expect(page).toHaveURL(new RegExp(`/t/${sampleTrip.id}/play`));
  });

  test("the nearest of two upcoming trips opens", async ({ page }) => {
    await signInWithMockBackend(page, both(other, sampleTrip));
    await page.goto("/play");
    await expect(page).toHaveURL(new RegExp(`/t/${sampleTrip.id}/play`));
  });

  test("a trip link still opens that trip, even a finished one", async ({ page }) => {
    await signInWithMockBackend(page, both(finished, sampleTrip));
    await page.goto(`/t/${finished.id}/play`);
    await expect(page.getByRole("heading", { name: finished.name })).toBeVisible();
  });
});

test.describe("QA-04: the install card isn't covered", () => {
  for (const width of [360, 390]) {
    test.describe(`${width} px`, () => {
      test.use({ viewport: { width, height: 800 } });
      test("the sky stays below the card, and Not now works", async ({ page }) => {
        await signInWithMockBackend(page, { trip: sampleTrip });
        await page.goto("/");
        const card = page.getByRole("region", { name: "Install TripJunkies" });
        await expect(card).toBeVisible();
        const home = page.locator(".cinematic-home-top");
        const geometry = await home.evaluate((el) => {
          const installCard = document.querySelector("[data-above-home]")!.getBoundingClientRect();
          return {
            skyTop:
              el.getBoundingClientRect().top + parseFloat(getComputedStyle(el, "::before").top),
            cardBottom: installCard.bottom,
          };
        });
        expect(geometry.skyTop).toBeGreaterThanOrEqual(geometry.cardBottom);
        const notNow = page.getByRole("button", { name: "Not now" });
        await notNow.click();
        await expect(card).toHaveCount(0);
        await expect(home).toBeVisible();
        // With nothing above it, the sky runs behind the header again: the approved design.
        expect(await home.evaluate((el) => getComputedStyle(el, "::before").top)).toBe("-110px");
      });
    });
  }
});

test.describe("QA-05: who can approve a waiting player", () => {
  const pending = [
    {
      user_id: "00000000-0000-4000-8000-0000000000c1",
      name: "Adult Andy",
      avatar_style: "traveler",
      avatar_seed: "1",
      age_range: "21+",
      joined_at: "2026-10-01T00:00:00Z",
    },
    {
      user_id: "00000000-0000-4000-8000-0000000000c2",
      name: "Young Yara",
      avatar_style: "traveler",
      avatar_seed: "2",
      age_range: "18–20",
      joined_at: "2026-10-01T00:00:00Z",
    },
    {
      user_id: "00000000-0000-4000-8000-0000000000c3",
      name: "Teen Tess",
      avatar_style: "traveler",
      avatar_seed: "3",
      age_range: "Teen 13–17",
      joined_at: "2026-10-01T00:00:00Z",
    },
  ];
  const open = async (page: Page, role: "captain" | "co_captain" | "player") => {
    const calls = await signInWithMockBackend(page, {
      trip: sampleTrip,
      role,
      rpc: { pending_members: pending },
    });
    await page.goto(`/t/${sampleTrip.id}/trip`);
    return calls;
  };
  const row = (page: Page, name: string) =>
    page
      .locator("div")
      .filter({ hasText: name })
      .filter({ has: page.getByRole("button", { name: `Decline ${name}` }) })
      .last();

  test("the Co-Captain approves adults; the Captain approves a teen", async ({ page }) => {
    const calls = await open(page, "co_captain");
    await expect(page.getByRole("button", { name: "Decline Adult Andy" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Decline Young Yara" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Decline Teen Tess" })).toHaveCount(0);
    await expect(page.getByText("Captain approves")).toHaveCount(1);
    await row(page, "Adult Andy").getByRole("button", { name: "Approve" }).click();
    await expect.poll(() => calls.some((c) => c.fn === "approve_member")).toBe(true);
    const call = calls.find((c) => c.fn === "approve_member")!;
    expect(call.body).toMatchObject({ p_user: pending[0]!.user_id, p_approve: true });
  });

  test("the Captain can approve all three", async ({ page }) => {
    await open(page, "captain");
    for (const p of pending)
      await expect(page.getByRole("button", { name: `Decline ${p.name}` })).toBeVisible();
    await expect(page.getByText("Captain approves")).toHaveCount(0);
  });

  test("a player sees no waiting list", async ({ page }) => {
    await open(page, "player");
    await expect(page.getByRole("heading", { name: "The Squad" })).toBeVisible();
    await expect(page.getByText("Adult Andy")).toHaveCount(0);
  });
});

test.describe("QA-08: wrap-up week on Up now", () => {
  const info = {
    picks: 2,
    picks_close_at: null,
    locks_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    questions: [
      { key: "moment", question: "Moment you'll never forget", emoji: false },
      { key: "bite", question: "Best bite", emoji: false },
      { key: "emoji", question: "Your trip in 3 emojis", emoji: true },
    ],
    kept: 6,
    solo: false,
  };
  const ended = { ...sampleTrip, start_date: day(-8), end_date: day(-4) };
  const start = async (
    page: Page,
    phase: string,
    tables: Record<string, object[]> = {},
    trip = ended,
  ) => {
    await signInWithMockBackend(page, {
      trip,
      rpc: { ...phaseRpc(phase), postcard_info: info },
      tables,
    });
    await page.goto(`/t/${trip.id}/play`);
    await expect(page.getByRole("heading", { name: "Up now" })).toBeVisible();
  };

  test("before Baggage Claim it isn't there", async ({ page }) => {
    await start(page, "trip_season", {}, { ...sampleTrip, start_date: day(-1), end_date: day(3) });
    await page.waitForTimeout(500);
    await expect(page.getByText(/questions left/)).toHaveCount(0);
  });

  test("on day 4 of 7 it's there, with no read-only notice", async ({ page }) => {
    await start(page, "baggage_claim");
    await expect(page.getByText(/3 of 3 questions left/)).toBeVisible();
    await expect(page.getByText(/You.re all caught up/)).toHaveCount(0);
    await expect(page.getByText("This trip has wrapped")).toHaveCount(0);
    await page.getByRole("button", { name: /Wrap-up week/ }).click();
    await expect(page.getByText("Moment you'll never forget")).toBeVisible();
  });

  test("it counts what's answered, and leaves when all three are done", async ({ page }) => {
    await start(page, "baggage_claim", {
      wrapup_answers: [
        { question_key: "moment", answer: "The rooftop" },
        { question_key: "bite", answer: "Tacos" },
      ],
    });
    await expect(page.getByText(/1 of 3 questions left/)).toBeVisible();
  });

  test("with all three answered, Up now gives the lock time", async ({ page }) => {
    await start(page, "baggage_claim", {
      wrapup_answers: info.questions.map((q) => ({ question_key: q.key, answer: "Yes" })),
    });
    await expect(page.getByText(/You.re all caught up/)).toBeVisible();
    await expect(page.getByText(/Your Trip Postcard locks/)).toBeVisible();
  });

  test("after the lock it's gone and the trip is read-only", async ({ page }) => {
    await start(page, "archived");
    await page.waitForTimeout(500);
    await expect(page.getByText(/questions left/)).toHaveCount(0);
    await expect(page.getByText("This trip has wrapped")).toBeVisible();
    await expect(page.getByText("Your trip has wrapped")).toBeVisible();
  });
});

test.describe("QA-09: before the first phase opens", () => {
  const near = (extra: object) => ({
    ...sampleTrip,
    start_date: day(5),
    end_date: day(8),
    ...extra,
  });

  test("zero days of Pre-Flight: Upcoming, Takeoff next, no Early Bird", async ({ page }) => {
    await signInWithMockBackend(page, {
      trip: near({ preflight_days: 0 }),
      rpc: { ...phaseRpc("upcoming"), my_standings: [] },
    });
    await page.goto(`/t/${sampleTrip.id}/play`);
    await expect(page.getByText(/Upcoming · Takeoff/)).toBeVisible();
    await expect(page.getByText(/Day 1 of/)).toHaveCount(0);
    await expect(page.getByText(/Early Bird race/)).toHaveCount(0);
    const rail = page.getByRole("navigation", { name: "Trip phases" });
    await expect(rail.getByText("NOW")).toHaveCount(0);
    await expect(rail.getByText("Skipped")).toBeVisible();
    await rail.getByRole("button", { name: /Pre-Flight/ }).click();
    await expect(page.getByText(/no Early Bird crown/)).toBeVisible();
    await expect(page.getByText("Sealed Quests")).toHaveCount(0);
  });

  test("a skipped Pre-Flight is the same", async ({ page }) => {
    await signInWithMockBackend(page, {
      trip: near({ preflight_days: 5, preflight_skipped: true }),
      rpc: phaseRpc("upcoming"),
    });
    await page.goto(`/t/${sampleTrip.id}/play`);
    await expect(page.getByText(/Upcoming · Takeoff/)).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Trip phases" }).getByText("Skipped"),
    ).toBeVisible();
  });

  test("five days, not open yet: Upcoming, with the date Pre-Flight opens", async ({ page }) => {
    await signInWithMockBackend(page, { trip: sampleTrip, rpc: phaseRpc("upcoming") });
    await page.goto(`/t/${sampleTrip.id}/play`);
    await expect(page.getByText(/Upcoming · Pre-Flight opens/)).toBeVisible();
    await expect(page.getByText(/Day 1 of/)).toHaveCount(0);
    const rail = page.getByRole("navigation", { name: "Trip phases" });
    await expect(rail.getByText("NOW")).toHaveCount(0);
    await rail.getByRole("button", { name: /Pre-Flight/ }).click();
    await expect(page.getByText(/Preview · opens/)).toBeVisible();
    await expect(page.getByText("Sealed Quests")).toBeVisible();
  });

  test("five days, open now: Day 1 of 5 and the Early Bird race", async ({ page }) => {
    await signInWithMockBackend(page, {
      trip: near({ preflight_days: 5, start_date: day(5) }),
      rpc: {
        ...phaseRpc("preflight"),
      },
      tables: {},
    });
    await page.goto(`/t/${sampleTrip.id}/play`);
    await expect(page.getByText(/Pre-Flight · Day \d of 5/)).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Trip phases" }).getByText("NOW"),
    ).toBeVisible();
    await expect(page.getByText(/Upcoming ·/)).toHaveCount(0);
  });
});

test.describe("QA-03: a trip in Baggage Claim stays reachable through Your Trips", () => {
  const baggage = {
    ...sampleTrip,
    id: "00000000-0000-4000-8000-0000000000b3",
    name: "Wrap Up Trip",
    destination: "Mexico City, Mexico",
    start_date: day(-8),
    end_date: day(-4),
  };
  const info = {
    picks: 2,
    picks_close_at: null,
    locks_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    questions: [{ key: "moment", question: "Moment you'll never forget", emoji: false }],
    kept: 6,
    solo: false,
  };
  const both = {
    trip: sampleTrip,
    rpc: { postcard_info: info },
    tables: {
      trips: [baggage, sampleTrip],
      trip_members: [member(baggage.id), member(sampleTrip.id)],
    },
  };

  test("the upcoming trip opens first, as agreed", async ({ page }) => {
    await signInWithMockBackend(page, both);
    await page.goto("/play");
    await expect(page).toHaveURL(new RegExp(`/t/${sampleTrip.id}/play`));
  });

  test("Your Trips lists it, and its wrap-up opens from there", async ({ page }) => {
    await signInWithMockBackend(page, both);
    await page.goto("/me?section=me-trips");
    const row = page.getByRole("button", { name: /^Wrap Up Trip/ }).first();
    await expect(row).toContainText("Completed");
    await row.click();
    await page.getByRole("link", { name: "Play" }).click();
    await expect(page).toHaveURL(new RegExp(`/t/${baggage.id}/play`));
    await expect(page.getByText(/1 of 1 questions left/)).toBeVisible();
    await page.getByRole("button", { name: /Wrap-up week/ }).click();
    await expect(page.getByText("Moment you'll never forget")).toBeVisible();
  });

  test("a link to it keeps working after a refresh", async ({ page }) => {
    await signInWithMockBackend(page, both);
    await page.goto(`/t/${baggage.id}/play`);
    await expect(page.getByRole("heading", { name: "Wrap Up Trip" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Wrap Up Trip" })).toBeVisible();
    await expect(page.getByText(/1 of 1 questions left/)).toBeVisible();
  });
});
