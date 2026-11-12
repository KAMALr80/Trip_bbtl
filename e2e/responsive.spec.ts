// The layout holds at the narrowest phone and on a desktop. The other specs run at iPhone 13 only.
import { expect, test } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

const SIZES = [
  { name: "small phone", width: 360, height: 740 },
  { name: "desktop", width: 1280, height: 800 },
];

async function noSidewaysScroll(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test("sign-in fits without sideways scrolling", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Sign in with email" })).toBeVisible();
      await noSidewaysScroll(page);
    });

    for (const path of ["/home", "/me", `/t/${sampleTrip.id}/play`, `/t/${sampleTrip.id}/trip`]) {
      test(`${path} fits without sideways scrolling`, async ({ page }) => {
        await signInWithMockBackend(page, { trip: sampleTrip });
        await page.goto(path);
        await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
        await noSidewaysScroll(page);
      });
    }
  });
}
