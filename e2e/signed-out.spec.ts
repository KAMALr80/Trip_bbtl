import { expect, test } from "@playwright/test";

test("a signed-out visitor can choose Google or email sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page.getByRole("textbox", { name: /email/i }).first()).toBeVisible();
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
