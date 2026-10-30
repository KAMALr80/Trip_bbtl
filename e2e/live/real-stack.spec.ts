// Signed-in smoke tests against the real local Supabase stack (`supabase start` applies the
// migrations and supabase/seed.sql). CI runs them in the `supabase` job with
// `npx playwright test -c playwright.live.config.ts`; the mocked-backend specs in e2e/ cover layout.
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "tripjunkies-local";

// CI only keeps the trace as an artifact; print what the page showed so the log says why.
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus)
    console.log(`Page at ${page.url()}:\n${await page.locator("body").ariaSnapshot()}`);
});

async function signIn(page: Page, handle: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.getByRole("textbox", { name: /email/i }).first().fill(`${handle}@tripjunkies.local`);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
}

test("a seeded Captain signs in and opens their trip's Play", async ({ page }) => {
  await signIn(page, "cap");
  await expect(page.getByRole("heading", { name: /Where to/ })).toBeVisible();
  await page.goto("/play");
  await expect(page).toHaveURL(/\/t\/[0-9a-f-]+\/play$/);
  await expect(page.getByRole("heading", { name: /Lisbon Crew|Departure Day/ })).toBeVisible();
});

test("an invite link survives sign-in, and Join room adds the player", async ({ page }) => {
  await page.goto("/join/LISBONXX");
  await signIn(page, "solo");
  const invite = page.getByLabel("Trip invitation");
  await expect(invite.getByText(/Lisbon/).first()).toBeVisible();
  await invite.getByRole("button", { name: "Join room" }).click();
  await expect(invite).toBeHidden();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
