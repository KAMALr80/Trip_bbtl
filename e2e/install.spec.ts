// M4-01: the install card on Home. iPhone Safari gets the Add to Home Screen steps; a browser with
// its own install prompt gets an Install button. "Not now" is remembered on this device.
import { expect, test } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

const installCard = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: "Install TripJunkies" });

test("iPhone Safari: Add to Home Screen steps, and Not now sticks", async ({ page }) => {
  await signInWithMockBackend(page, { trip: sampleTrip });
  await page.goto("/home");
  await expect(installCard(page)).toContainText("Add to Home Screen");
  await installCard(page).getByRole("button", { name: "Not now" }).click();
  await expect(installCard(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(installCard(page)).toHaveCount(0);
});

test("not offered before the player is in a trip", async ({ page }) => {
  await signInWithMockBackend(page);
  await page.goto("/home");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(installCard(page)).toHaveCount(0);
});

test.describe("a browser with its own install prompt", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
  });

  test("Install opens the browser's prompt", async ({ page }) => {
    await signInWithMockBackend(page, { trip: sampleTrip });
    await page.goto("/home");
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await expect(installCard(page)).toHaveCount(0);
    await page.evaluate(() => {
      const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt: async () => {
          (window as unknown as { prompted: boolean }).prompted = true;
        },
        userChoice: Promise.resolve({ outcome: "accepted" }),
      });
      window.dispatchEvent(event);
    });
    await installCard(page).getByRole("button", { name: "Install" }).click();
    await expect(installCard(page)).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(
      true,
    );
  });
});
