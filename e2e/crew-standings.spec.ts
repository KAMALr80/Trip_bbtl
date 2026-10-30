// M3-15 / M3-16: the Trip tab's standings come from the points ledger, with the crowns.
import { expect, test } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

const me = "00000000-0000-4000-8000-000000000001";
const riley = "00000000-0000-4000-8000-000000000009";

test("crew standings: ledger points, place and the Early Bird crown", async ({ page }) => {
  await signInWithMockBackend(page, {
    trip: sampleTrip,
    tables: {
      trip_crowns: [
        {
          trip_id: sampleTrip.id,
          season: "preflight",
          user_id: riley,
          points: 42,
          crowned_at: "2026-10-01T00:00:00Z",
        },
      ],
      trip_player_cards: [
        {
          trip_id: sampleTrip.id,
          user_id: me,
          game_name: "Tester",
          avatar_style: "traveler",
          avatar_seed: "1",
          avatar_path: null,
        },
        {
          trip_id: sampleTrip.id,
          user_id: riley,
          game_name: "Riley",
          avatar_style: "traveler",
          avatar_seed: "2",
          avatar_path: null,
        },
      ],
    },
    rpc: {
      trip_standings: [
        {
          user_id: riley,
          points: 42,
          rank: 1,
          showcase_points: 20,
          last_earned_at: "2026-10-01T00:00:00Z",
        },
        {
          user_id: me,
          points: 30,
          rank: 2,
          showcase_points: 0,
          last_earned_at: "2026-10-01T00:00:00Z",
        },
      ],
    },
  });
  await page.goto("/trip");
  const standings = page.getByRole("region", { name: "Standings" });
  await expect(standings.getByText("#2")).toBeVisible();
  await expect(standings.getByText("Early Bird", { exact: true })).toBeVisible();
  await expect(standings.getByText("42 pts").first()).toBeVisible();
});
