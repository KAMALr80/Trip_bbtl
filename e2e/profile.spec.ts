// M5-10 Passport Junkie profile, M5-11 Me tab, M5-13 the 7-card tour.
import { expect, test } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

const me = "00000000-0000-4000-8000-000000000001";
const base = {
  user_id: me,
  game_name: "Tester",
  avatar_style: "traveler",
  avatar_seed: "1",
  avatar_path: null,
  level: "tourist",
  stars: 0,
  countries: 1,
  is_public: false,
  self: true,
  crew: true,
};

test.describe("Deleting an account (B-31)", () => {
  test("an account with a password has to enter it", async ({ page }) => {
    await signInWithMockBackend(page);
    await page.goto("/me?view=delete");
    const button = page.getByRole("button", { name: "Delete forever" });
    await expect(button).toBeDisabled();
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await expect(button).toBeDisabled();
    await page.getByLabel("Enter your password").fill("my password");
    await expect(button).toBeEnabled();
  });
});

test.describe("Me tab", () => {
  test.use({ locale: "pt-PT" });
  test("From is filled from the phone's region; save it with About me and go public", async ({
    page,
  }) => {
    const calls = await signInWithMockBackend(page, {
      trip: sampleTrip,
      rpc: {
        player_profile: {
          ...base,
          private: false,
          about_me: null,
          from: null,
          badges: [],
          stamps: [],
        },
        my_stamps: [],
        set_profile: null,
      },
      tables: { profile_prefs: [] },
    });
    await page.goto("/me");
    const profile = page.getByRole("region", { name: "Your profile" });
    await expect(profile.getByLabel("From")).toHaveValue("Portugal");
    await expect(
      profile.getByText("Filled in from your phone's region. Save to keep it."),
    ).toBeVisible();
    await profile.getByLabel("About me").fill("Pastry hunter");
    await profile.getByRole("switch", { name: "Public profile" }).click();
    await profile.getByRole("button", { name: "Save profile" }).click();
    await expect
      .poll(() => calls.find((c) => c.fn === "set_profile")?.body)
      .toEqual({ p_public: true, p_about: "Pastry hunter", p_from: "Portugal" });
    // Everything on deck slide 16 is one tap away.
    for (const name of [
      /Notifications/,
      /Captain tools/,
      /Help & FAQ/,
      /Replay the tour/,
      /Account & legal/,
    ])
      await expect(page.getByRole("button", { name })).toBeVisible();
  });
});

test("a private profile shows an outsider only avatar, name and level", async ({ page }) => {
  await signInWithMockBackend(page, {
    trip: sampleTrip,
    rpc: {
      player_profile: {
        ...base,
        self: false,
        crew: false,
        private: true,
        level: "explorer",
        countries: 3,
      },
    },
  });
  await page.goto(`/p/${me}`);
  await expect(page.getByRole("heading", { name: "Tester" })).toBeVisible();
  await expect(page.getByLabel("Level: Explorer")).toBeVisible();
  await expect(page.getByText("This profile is private.")).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
});

test("tapping a crew avatar opens their profile with this trip's role", async ({ page }) => {
  const calls = await signInWithMockBackend(page, {
    trip: sampleTrip,
    rpc: {
      player_profile: {
        ...base,
        self: false,
        private: false,
        about_me: "Always the first one at the gate",
        from: "Canada",
        this_trip: {
          trip_id: sampleTrip.id,
          trip_name: sampleTrip.name,
          role: "captain",
          persona: null,
          most_excited: "Sunset at Belém",
        },
        badges: [{ badge: "storyteller", tier: 2 }],
        stamps: [
          {
            trip_id: "00000000-0000-4000-8000-0000000000b2",
            kind: "international",
            country: "Japan",
            state: null,
            city: "Tokyo",
            culture: null,
            stamped_on: "2026-04-10",
            season_label: "Spring 2026",
            room: "trip",
            solo: false,
            crowns: ["trip_season"],
            trip_name: "Tokyo Nights",
            top: true,
            hidden: false,
            has_postcard: false,
          },
        ],
      },
    },
  });
  await page.goto(`/t/${sampleTrip.id}/trip`);
  await page.getByRole("button", { name: "Open Tester's profile" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Passport Junkie" });
  await expect(sheet.getByText("Always the first one at the gate")).toBeVisible();
  await expect(sheet.getByText("Sunset at Belém")).toBeVisible();
  await expect(sheet.getByText("Storyteller · Checked Bag")).toBeVisible();
  await expect
    .poll(() => calls.find((c) => c.fn === "player_profile")?.body)
    .toEqual({ p_user: me, p_trip: sampleTrip.id });
  await sheet.getByRole("tab", { name: "Stamps & trips" }).click();
  await expect(sheet.getByText("★ Japan")).toBeVisible();
  await sheet.getByRole("button", { name: "Close the profile" }).click();
  await expect(sheet).toHaveCount(0);
});

test("the tour: 7 swipe cards, only Skip and Get started", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Take a look around/ }).click();
  const tour = page.getByRole("region", { name: "The TripJunkies tour" });
  await expect(tour.getByRole("heading", { name: "Welcome to TripJunkies" })).toBeVisible();
  await expect(page.getByRole("button")).toHaveText(["Skip"]);
  await tour.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await expect(page.getByRole("button", { name: "Get started" })).toBeVisible();
  await expect(page.getByRole("button")).toHaveText(["Get started"]);
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByRole("button", { name: /Take a look around/ })).toBeVisible();
});
