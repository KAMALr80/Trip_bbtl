// M3-07: Game Night Live on Play — 👍 a crewmate, vote an award in secret, the Captain closes.
import { expect, test } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const me = "00000000-0000-4000-8000-000000000001";
const riley = "00000000-0000-4000-8000-000000000009";
const session = "00000000-0000-4000-8000-0000000000f1";

test("Game Night Live: Show & Tell, an award vote, and Close", async ({ page }) => {
  const trip = { ...sampleTrip, start_date: day(5), end_date: day(9), preflight_days: 10 };
  const calls = await signInWithMockBackend(page, {
    trip,
    tables: {
      live_sessions: [
        {
          id: session,
          trip_id: trip.id,
          call_night_id: null,
          is_crowning: false,
          season: "preflight",
          status: "open",
          opened_by: me,
          opened_at: new Date().toISOString(),
          closed_by: null,
          closed_at: null,
          auto_close_at: new Date(Date.now() + 6 * 3600_000).toISOString(),
        },
      ],
      trip_player_cards: [
        {
          trip_id: trip.id,
          user_id: me,
          game_name: "Tester",
          avatar_style: "traveler",
          avatar_seed: "1",
          avatar_path: null,
        },
        {
          trip_id: trip.id,
          user_id: riley,
          game_name: "Riley",
          avatar_style: "traveler",
          avatar_seed: "2",
          avatar_path: null,
        },
      ],
    },
    rpc: {
      live_state: [
        { user_id: me, thumbs: 0, i_tapped: false, my_awards: [], won_awards: [] },
        { user_id: riley, thumbs: 1, i_tapped: false, my_awards: [], won_awards: [] },
      ],
      live_present: true,
      live_vote_award: null,
      close_live: null,
    },
  });
  await page.goto(`/t/${trip.id}/play`);
  await page
    .getByRole("navigation", { name: "Trip phases" })
    .getByRole("button", { name: /Pre-Flight/ })
    .click();
  const live = page.getByRole("region", { name: "Game Night Live" });
  await expect(live.getByRole("button", { name: "Tester (you)" })).toBeDisabled();
  await live.getByRole("button", { name: "👍 Riley" }).click();
  await live.getByRole("button", { name: /Best Overall.*Vote Riley/ }).click();
  await live.getByRole("button", { name: "Close Game Night" }).click();
  await expect.poll(() => calls.map((c) => c.fn)).toContain("close_live");
  expect(calls.find((c) => c.fn === "live_present")?.body).toEqual({
    p_session: session,
    p_presenter: riley,
  });
  expect(calls.find((c) => c.fn === "live_vote_award")?.body).toEqual({
    p_session: session,
    p_award: "best_overall",
    p_nominee: riley,
  });
});
