// M1-12: accessibility pass on the kept screens, signed out and signed in (mocked backend).
// axe covers WCAG 2.1 A/AA; it can't measure text over the shell's translucent cards and gradients,
// so support/contrast.ts measures what is actually painted there.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { lowContrast } from "./support/contrast";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

async function check(page: Page) {
  // Let entrance animations finish so colours are measured at rest.
  await page.waitForTimeout(1500);
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
  expect(await lowContrast(page)).toEqual([]);
}

test("sign-in screens", async ({ page }) => {
  await page.goto("/");
  const email = page.getByRole("button", { name: "Sign in with email" });
  await email.waitFor();
  await check(page);
  await email.click();
  await check(page);
});

for (const path of ["/home", "/play", "/trip", "/trip?tools=true", "/me", "/me?view=help"]) {
  test(`signed in: ${path}`, async ({ page }) => {
    await signInWithMockBackend(page, { trip: sampleTrip });
    await page.goto(path);
    await page.getByRole("navigation", { name: "Main navigation" }).waitFor();
    await check(page);
  });
}

test("setup wizard", async ({ page }) => {
  await signInWithMockBackend(page);
  await page.goto("/trips/new?room=trip");
  await page.getByRole("radio", { name: /My crew/ }).click();
  await check(page);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("combobox").first().fill("Po");
  await expect(page.getByRole("option", { name: "Portugal" })).toBeVisible();
  await check(page); // place suggestions open
  await page.getByRole("option", { name: "Portugal" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Trip basics" })).toBeVisible();
  await check(page);
});
