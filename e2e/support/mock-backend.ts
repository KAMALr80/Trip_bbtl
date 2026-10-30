// A small stand-in for the Supabase API, for signed-in smoke tests without the local stack
// (`supabase start` needs Docker images). It answers only what the app shell asks for on start-up;
// anything else gets an empty answer. It checks navigation and layout, not game rules: those are
// covered by the pgTAP tests in supabase/tests/database.
import type { Page, Route } from "@playwright/test";

const SUPABASE = "http://127.0.0.1:54321";
const userId = "00000000-0000-4000-8000-000000000001";
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "tester@example.com",
  app_metadata: { provider: "email" },
  user_metadata: { full_name: "Tester" },
  created_at: "2026-01-01T00:00:00Z",
};

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const accessToken = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
  sub: userId,
  role: "authenticated",
  aud: "authenticated",
  exp: Math.floor(Date.now() / 1000) + 3600 * 24,
})}.signature`;

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
export const sampleTrip = {
  id: "00000000-0000-4000-8000-0000000000a1",
  name: "Lisbon Crew",
  destination: "Lisbon, Portugal",
  start_date: day(20),
  end_date: day(26),
  kind: "trip",
  join_code: "ABC123",
  join_code_enabled: true,
  join_locked: false,
  home_timezone: "UTC",
  trip_timezone: "Europe/Lisbon",
  rules_version: 2,
  room: "trip",
  play_mode: "crew",
  preflight_days: 5,
  preflight_skipped: false,
  arrived_at: null as string | null,
  setup_completed_at: "2026-10-01T00:00:00Z",
  crowning_at: null as string | null,
  crowning_place: null as string | null,
  crowning_call_link: null as string | null,
  cultures: [] as string[],
  passport_country: "PT",
  passport_city: "Lisbon",
  season_rule: "a2c",
  season_scoring: true,
  is_sandbox: false,
  ended_at: null,
  vibe: "chill",
  created_at: "2026-10-01T00:00:00Z",
};

type Options = {
  trip?: typeof sampleTrip;
  rpc?: Record<string, unknown>;
  noCard?: boolean;
  tables?: Record<string, object[]>;
  role?: "captain" | "co_captain" | "player";
};
export type RpcCall = { fn: string; body: unknown };

export async function signInWithMockBackend(page: Page, options: Options = {}): Promise<RpcCall[]> {
  const calls: RpcCall[] = [];
  const session = {
    access_token: accessToken,
    refresh_token: "refresh",
    token_type: "bearer",
    expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    user,
  };
  await page.addInitScript((value) => {
    // supabase-js keys the session by the first label of the project host ("127").
    window.localStorage.setItem("sb-127-auth-token", value);
  }, JSON.stringify(session));

  const rows: Record<string, object[]> = {
    profiles: [
      {
        id: userId,
        display_name: "Tester",
        avatar_url: null,
        onboarding_completed: true,
        appearance: null,
        seen_tips: ["captain", "co_captain", "home_country", "window_seat_intro"],
        time_zone: "UTC",
        time_zone_manual: false,
      },
    ],
    player_profiles: [
      { user_id: userId, game_name: "Tester", avatar_style: "traveler", avatar_seed: "1" },
    ],
    trips: options.trip ? [options.trip] : [],
    trip_members: options.trip
      ? [
          {
            trip_id: options.trip.id,
            user_id: userId,
            role: options.role ?? "captain",
            status: "approved",
          },
        ]
      : [],
    trip_player_cards:
      options.trip && !options.noCard
        ? [
            {
              trip_id: options.trip.id,
              user_id: userId,
              game_name: "Tester",
              avatar_style: "traveler",
              avatar_seed: "1",
              avatar_path: null,
            },
          ]
        : [],
  };
  Object.assign(rows, options.tables);
  const rpc: Record<string, unknown> = {
    account_status: [{ legal_version: "2026-10-03" }],
    my_access: [{ beta: true, has_dob: true, age_range: "21+" }],
    public_launch: true,
    is_app_admin: false,
    trip_roster: options.trip
      ? [
          {
            user_id: userId,
            role: "captain",
            display_name: "Tester",
            avatar_url: null,
            joined_at: "2026-10-01T00:00:00Z",
          },
        ]
      : [],
    ...options.rpc,
  };

  await page.route(`${SUPABASE}/**`, async (route: Route) => {
    const url = new URL(route.request().url());
    const single = (route.request().headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/auth/v1/user") return json(user);
    if (url.pathname.startsWith("/auth/v1/")) return json({});
    const fn = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)/)?.[1];
    if (fn) {
      calls.push({ fn, body: route.request().postDataJSON() as unknown });
      return json(fn in rpc ? rpc[fn] : null);
    }
    const table = url.pathname.match(/^\/rest\/v1\/(\w+)/)?.[1];
    if (table) {
      const data = rows[table] ?? [];
      if (single)
        return data[0]
          ? json(data[0])
          : json({ code: "PGRST116", message: "0 rows", details: null, hint: null }, 406);
      return json(data);
    }
    return json({});
  });
  return calls;
}
