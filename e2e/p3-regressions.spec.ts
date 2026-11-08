// Regression tests for the P3 findings N-4, N-5 and N-6, against the mocked backend. N-3 and N-7
// are covered by unit tests (src/features/play/up-now.test.ts, src/lib/places.test.ts).
import { expect, test } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

test("N-6: a declined player is told on Home and can dismiss it", async ({ page }) => {
  const calls = await signInWithMockBackend(page, {
    trip: sampleTrip,
    rpc: {
      my_join_declines: [
        {
          trip_id: "00000000-0000-4000-8000-0000000000d1",
          name: "Lisbon Crew",
          declined_at: "2026-11-08T10:00:00Z",
        },
      ],
    },
  });
  await page.goto("/home");
  const notice = page.getByRole("status").filter({ hasText: "Lisbon Crew" });
  await expect(notice).toContainText("Your request to join Lisbon Crew wasn't approved");
  await notice.getByRole("button", { name: "Got it" }).click();
  await expect(notice).toHaveCount(0);
  await expect
    .poll(() => calls.find((c) => c.fn === "dismiss_join_decline")?.body)
    .toEqual({ p_trip: "00000000-0000-4000-8000-0000000000d1" });
});

test("N-6: no notice when nothing was declined", async ({ page }) => {
  await signInWithMockBackend(page, { trip: sampleTrip });
  await page.goto("/home");
  await expect(page.getByRole("heading").first()).toBeVisible();
  await expect(page.getByText(/wasn't approved/)).toHaveCount(0);
});

test.describe("sign-up with email confirmation", () => {
  async function signUp(page: import("@playwright/test").Page) {
    await page.route("**/auth/v1/signup**", (route) =>
      route.fulfill({ json: { id: "new-user", email: "new@example.com", user_metadata: {} } }),
    );
    // Sign-up shows once the app is open to the public (public_launch) or with an invite.
    await page.route("**/rest/v1/rpc/public_launch", (route) => route.fulfill({ json: true }));
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in with email" }).click();
    await page.getByRole("button", { name: "New here? Sign up" }).click();
    await page.getByRole("textbox", { name: "Email address" }).fill("new@example.com");
    await page.getByLabel("Password", { exact: true }).fill("a-long-password-1");
    await page.getByLabel("Birthday").fill("1990-04-02");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Sign up", exact: true }).click();
    await expect(page.getByText("Check your email")).toBeVisible();
  }

  test("N-5: a wrong code doesn't claim the code expired", async ({ page }) => {
    await page.route("**/auth/v1/verify**", (route) =>
      route.fulfill({
        status: 403,
        json: { code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" },
      }),
    );
    await signUp(page);
    await page.getByLabel("Digit 1").fill("123456");
    const alert = page.getByText(/That code didn't work/);
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Check the digits");
    await expect(page.getByText(/That code expired/)).toHaveCount(0);
  });
});

test("N-4: after confirming the email, the sign-up answers are saved and not asked again", async ({
  page,
}) => {
  const calls = await signInWithMockBackend(page, {
    trip: sampleTrip,
    userMetadata: { legal_version: "2026-10-03", birthday: "1990-04-02" },
    rpc: { account_status: [] },
  });
  await page.goto("/home");
  await expect
    .poll(() => calls.find((c) => c.fn === "set_my_dob")?.body)
    .toEqual({ p_dob: "1990-04-02", p_agree: true });
  expect(calls.find((c) => c.fn === "accept_legal")?.body).toEqual({ p_version: "2026-10-03" });
  await expect(page.getByText("One quick agreement")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "When's your birthday? 🎂" })).toHaveCount(0);
});

test("N-4: without sign-up answers, the agreement is still asked", async ({ page }) => {
  const calls = await signInWithMockBackend(page, {
    trip: sampleTrip,
    rpc: { account_status: [] },
  });
  await page.goto("/home");
  await expect(page.getByText("One quick agreement")).toBeVisible();
  expect(calls.some((c) => c.fn === "accept_legal")).toBe(false);
});

test.describe("QA-12, QA-13: founder links for a player open their own Me page", () => {
  for (const path of [
    "/me?view=lab",
    "/me?view=reports",
    "/me?view=feedback",
    "/me?view=nonsense",
    "/me?section=moderation",
    "/me?section=admin-directory",
  ]) {
    test(path, async ({ page }) => {
      await signInWithMockBackend(page, { trip: sampleTrip });
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "It’s you!" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Delete my account" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Photo review" })).toHaveCount(0);
    });
  }
  test("the delete page still opens from its own link", async ({ page }) => {
    await signInWithMockBackend(page, { trip: sampleTrip });
    await page.goto("/me?view=delete");
    await expect(page.getByRole("heading", { name: "Delete my account" })).toBeVisible();
  });
});

test("QA-18: a signed-out trip link asks for nothing the visitor can't have", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (r) => {
    if (/\/rest\/v1\//.test(r.url())) asked.push(new URL(r.url()).pathname);
  });
  await page.goto("/t/00000000-0000-4000-8000-000000000123/play");
  await expect(page.getByRole("button", { name: "Sign in with email" })).toBeVisible();
  expect(asked.filter((p) => /trip_roster|trip_player_cards|player_card_read/.test(p))).toEqual([]);
});

test.describe("QA-16: a failed trip list isn't shown as no trips", () => {
  for (const path of ["/home", "/trip"]) {
    test(path, async ({ page }) => {
      await signInWithMockBackend(page, { trip: sampleTrip });
      let fail = true;
      await page.route("**/rest/v1/trip_members**", (route) =>
        fail
          ? route.fulfill({ status: 500, json: { message: "upstream exploded at db-7" } })
          : route.fallback(),
      );
      await page.goto(path);
      const alert = page.getByRole("alert").filter({ hasText: "We couldn't load your trips" });
      await expect(alert).toBeVisible();
      await expect(page.getByText("No trips just yet")).toHaveCount(0);
      await expect(page.getByText("upstream exploded")).toHaveCount(0);
      fail = false;
      await alert.getByRole("button", { name: "Try again" }).click();
      await expect(alert).toHaveCount(0);
    });
  }
});

test.describe("QA-19: headings and tap targets", () => {
  test("the sign-in screen has a page heading", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Think you can out-travel your crew?",
    );
  });
  test("switches take a 44 px tap", async ({ page }) => {
    // One reminder type, so the page has a switch to measure.
    const reminder = {
      type: "daily",
      label: "Daily Discovery each morning",
      push: true,
      email: false,
      quiet_start: "22:00:00",
      quiet_end: "08:00:00",
    };
    await signInWithMockBackend(page, {
      trip: sampleTrip,
      rpc: { my_notification_settings: [reminder] },
    });
    await page.goto("/me?view=notifications");
    const toggle = page.getByRole("switch").first();
    await expect(toggle).toBeVisible();
    const box = await toggle.boundingBox();
    if (!box) throw new Error("no switch box");
    // Just outside the 20 px track, inside the tap area: the switch still gets the tap.
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="switch"]') !== null,
      { x: box.x + box.width / 2, y: box.y - 10 },
    );
    expect(hit).toBe(true);
  });
});

test("the app starts even when Google Fonts never answers (stuck-splash flake)", async ({
  page,
}) => {
  // A stylesheet in the head used to hold back every script until fonts.googleapis.com replied.
  await page.route("https://fonts.googleapis.com/**", () => undefined);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in with email" })).toBeVisible();
});
