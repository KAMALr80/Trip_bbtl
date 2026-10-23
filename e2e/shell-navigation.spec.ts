// M1-04: tabs are URLs. Signed in against the mocked backend (no trips yet).
import { expect, test } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

const nav = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Main navigation" });

test("the tab bar is Home · Play · Trip · Me, and each tab has a URL", async ({ page }) => {
  await signInWithMockBackend(page);
  await page.goto("/");
  await expect(nav(page).getByRole("link")).toHaveText(["Home", "Play", "Trip", "Me"]);

  await nav(page).getByRole("link", { name: "Play", exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByText("The games are waiting")).toBeVisible();

  await nav(page).getByRole("link", { name: "Trip", exact: true }).click();
  await expect(page).toHaveURL(/\/trip$/);
  await expect(page.getByText("No trips just yet")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/play$/);
  await expect(nav(page).getByRole("link", { name: "Play", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("a tab survives a refresh", async ({ page }) => {
  await signInWithMockBackend(page);
  await page.goto("/me");
  await expect(nav(page).getByRole("link", { name: "Me", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.reload();
  await expect(nav(page).getByRole("link", { name: "Me", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("sub-screens are search params and bad ones are ignored", async ({ page }) => {
  await signInWithMockBackend(page);
  await page.goto("/me?view=help");
  await expect(page.getByRole("heading", { name: "Help & how it works" })).toBeVisible();
  await page.goto("/home?screen=nonsense&view=nonsense");
  await expect(nav(page).getByRole("link", { name: "Home", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("the crew list lives in the Trip tab (Q6)", async ({ page }) => {
  await signInWithMockBackend(page, { trip: sampleTrip });
  await page.goto("/trip");
  await expect(page.getByRole("heading", { name: "The Squad" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Invite" })).toBeVisible();
});

test("Captain Tools has a URL and Back closes it", async ({ page }) => {
  await signInWithMockBackend(page, { trip: sampleTrip });
  await page.goto("/trip");
  await page.getByRole("button", { name: "Captain Tools" }).click();
  await expect(page).toHaveURL(/\/trip\?tools=true$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/trip$/);
  await expect(page.getByRole("heading", { name: "The Squad" })).toBeVisible();
});

test("Play and Trip URLs name the open trip, and survive a refresh", async ({ page }) => {
  await signInWithMockBackend(page, { trip: sampleTrip });
  await page.goto("/play");
  await expect(page).toHaveURL(new RegExp(`/t/${sampleTrip.id}/play$`));
  await nav(page).getByRole("link", { name: "Trip", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${sampleTrip.id}/trip$`));
  await page.reload();
  await expect(page.getByRole("heading", { name: "The Squad" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/t/${sampleTrip.id}/trip$`));
  await nav(page).getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test("a trip URL that isn't one of mine opens my current trip instead", async ({ page }) => {
  await signInWithMockBackend(page, { trip: sampleTrip });
  await page.goto("/t/00000000-0000-4000-8000-00000000ffff");
  await expect(page).toHaveURL(new RegExp(`/t/${sampleTrip.id}/play$`));
});
