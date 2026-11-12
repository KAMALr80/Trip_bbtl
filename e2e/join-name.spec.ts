// N-2: a player names themselves before asking to join, on every way in. The Captain's view of the
// name and who may read it are covered by 40_privacy_and_join_names.test.sql and the gameplay QA run.
import { expect, test, type Page } from "@playwright/test";
import { signInWithMockBackend, type RpcCall } from "./support/mock-backend";

const preview = {
  trip_invite_preview: [
    {
      name: "Lisbon Crew",
      destination: "Lisbon, Portugal",
      motto: null,
      start_date: "2026-12-01",
      end_date: "2026-12-05",
      member_count: 3,
      captain_name: "Casey",
      captain_style: "street",
      captain_seed: "1",
      captain_avatar_url: null,
    },
  ],
  join_trip: "00000000-0000-4000-8000-0000000000a1",
};
const savedInvite = (page: Page) =>
  page.addInitScript(() => {
    localStorage.setItem("squad-pending-code", "LISBONXX");
    localStorage.setItem("squad-pending-code-at", String(Date.now()));
  });
const joined = (calls: RpcCall[]) => calls.find((c) => c.fn === "join_trip");

test("the invite card asks for a name before Join room", async ({ page }) => {
  const calls = await signInWithMockBackend(page, {
    rpc: preview,
    tables: { player_profiles: [] },
  });
  await savedInvite(page);
  await page.goto("/home");
  const invite = page.getByLabel("Trip invitation");
  const join = invite.getByRole("button", { name: "Join room" });
  const name = invite.getByRole("textbox", { name: /Your name/ });
  await expect(name).toHaveValue("");
  await expect(join).toBeDisabled();
  await name.fill("   ");
  await expect(join).toBeDisabled();
  await name.fill("P");
  await expect(join).toBeDisabled();
  expect(joined(calls)).toBeUndefined();
  await name.fill("  Penny   Lane ");
  await expect(join).toBeEnabled();
  await join.click();
  await expect.poll(() => joined(calls)).toBeTruthy();
  expect(joined(calls)!.body).toEqual({ p_code: "LISBONXX", p_display_name: "Penny Lane" });
});

test("a player with a card has their name filled in, and can change it", async ({ page }) => {
  const calls = await signInWithMockBackend(page, { rpc: preview });
  await savedInvite(page);
  await page.goto("/home");
  const invite = page.getByLabel("Trip invitation");
  const name = invite.getByRole("textbox", { name: /Your name/ });
  await expect(name).toHaveValue("Tester");
  await name.fill("Tess");
  await invite.getByRole("button", { name: "Join room" }).click();
  await expect.poll(() => joined(calls)).toBeTruthy();
  expect(joined(calls)!.body).toMatchObject({ p_display_name: "Tess" });
});

test("the join sheet asks for a name too", async ({ page }) => {
  const calls = await signInWithMockBackend(page, {
    rpc: preview,
    tables: { player_profiles: [] },
  });
  await page.goto("/me?section=me-trips");
  await page.getByRole("button", { name: "Join another trip" }).click();
  const sheet = page.getByRole("dialog", { name: "Join a trip" });
  await sheet.getByRole("textbox", { name: /code/i }).fill("LISBONXX");
  const join = sheet.getByRole("button", { name: "Join room" });
  await expect(join).toBeDisabled();
  await sheet.getByRole("textbox", { name: /Your name/ }).fill("Penny");
  await expect(join).toBeEnabled();
  await join.click();
  await expect.poll(() => joined(calls)).toBeTruthy();
  expect(joined(calls)!.body).toEqual({ p_code: "LISBONXX", p_display_name: "Penny" });
});
