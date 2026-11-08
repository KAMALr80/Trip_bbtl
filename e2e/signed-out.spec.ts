import { expect, test } from "@playwright/test";

test("a signed-out visitor can choose Google or email sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page.getByRole("textbox", { name: /email/i }).first()).toBeVisible();
});

test("Google sign-in that's off in Auth settings says so instead of redirecting", async ({
  page,
}) => {
  await page.route("**/auth/v1/settings", (route) =>
    route.fulfill({ json: { external: { google: false, email: true } } }),
  );
  let authorized = false;
  await page.route("**/auth/v1/authorize**", (route) => {
    authorized = true;
    return route.fulfill({ body: "redirected" });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Google sign-in isn't turned on here. Use email to sign in.",
  );
  expect(authorized).toBe(false);
  // Still on the app's own front page, whichever server runs the tests.
  await expect(page).toHaveURL(/^http:\/\/(localhost|127\.0\.0\.1):\d+\/$/);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page.getByRole("textbox", { name: /email/i }).first()).toBeVisible();
});

test("Google sign-in that's on in Auth settings goes to the provider", async ({ page }) => {
  await page.route("**/auth/v1/settings", (route) =>
    route.fulfill({ json: { external: { google: true, email: true } } }),
  );
  await page.route("**/auth/v1/authorize**", (route) => route.fulfill({ body: "redirected" }));
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/\/auth\/v1\/authorize\?provider=google/);
});

test("Google sign-in goes to the provider when Auth settings can't tell", async ({ page }) => {
  await page.route("**/auth/v1/settings", (route) => route.fulfill({ json: {} }));
  await page.route("**/auth/v1/authorize**", (route) => route.fulfill({ body: "redirected" }));
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/\/auth\/v1\/authorize\?provider=google/);
  await expect(page.getByText(/isn't turned on|didn't work/)).toHaveCount(0);
});

test("a signed-out visitor makes no admin check (it could only answer 401)", async ({ page }) => {
  let adminChecks = 0;
  await page.route("**/rest/v1/rpc/is_app_admin", (route) => {
    adminChecks++;
    return route.fulfill({ status: 401, json: { message: "permission denied" } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in with email" })).toBeVisible();
  await page.waitForTimeout(1000);
  expect(adminChecks).toBe(0);
});

test("legal pages are readable without signing in", async ({ page }) => {
  await page.goto("/legal/terms");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/Last updated/)).toBeVisible();
});

test("an invite link is kept through sign-in for 24 hours", async ({ page }) => {
  await page.goto("/join/abcdef");
  await expect(page).toHaveURL(/\/$/);
  const saved = await page.evaluate(() => ({
    code: localStorage.getItem("squad-pending-code"),
    at: Number(localStorage.getItem("squad-pending-code-at")),
  }));
  expect(saved.code).toBe("ABCDEF");
  expect(Date.now() - saved.at).toBeLessThan(60_000);
});

test("the version endpoint answers for the update prompt", async ({ request }) => {
  const response = await request.get("/api/public/version");
  expect(response.ok()).toBe(true);
});
