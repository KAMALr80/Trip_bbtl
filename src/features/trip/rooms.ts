// Rooms as configuration (M2-01, dev-docs/03 §5). Rooms change the content and the theme, never the
// flow (R-002): every room runs the same phases and Play engine, and these values are the only
// place their limits live. The server holds the same table in trip_private.room_rules(room) and
// validates every write against it; supabase/tests/fixtures/rooms.json is checked against both.

export const roomIds = [
  "trip",
  "window_seat",
  "explore_culture",
  "show_culture",
  "game_night",
] as const;
export type RoomId = (typeof roomIds)[number];
export const playModes = ["solo", "crew", "offline"] as const;
export type PlayMode = (typeof playModes)[number];

export type RoomConfig = {
  id: RoomId;
  /** Home time only; Takeoff is Home Missions the day before; Trip Season = experience days (R-108, R-110). */
  atHome: boolean;
  /** Which "Who's playing?" answers the room offers (R-003 – R-006). */
  modes: PlayMode[];
  /** Players in one crew, Captain included (R-005, R-901). */
  maxCrew: number;
  /** Trip or experience days (R-112). */
  mainDays: { min: number; max: number };
  /** Pre-Flight days before the first day; 0 or Skip means none (R-101, R-105). */
  preFlightDays: { min: number; max: number; skippable: boolean };
  /** Video-call nights during Pre-Flight (R-204). */
  maxCallNights: number;
  takeoff: "airport_missions" | "home_missions" | "none";
  tripSeasonStart: "arrival_button" | "first_experience_day";
  crowningLabel: "Crowning night" | "Finale night" | "Game night";
  /** Photos each player keeps after Baggage Claim (R-606). */
  photosKept: { group: number; solo: number };
  /** Postcard Picks per player (R-354: 5 for a Window Seat crew). */
  postcardPicksPerPlayer: number;
  dailyQuest: boolean;
  journal: boolean;
  /** Explore a Culture: up to two focuses (R-361, R-363). */
  maxFocuses: number;
  /** Content tags this room draws from (R-007). */
  contentTags: ("trip" | "at_home" | "solo")[];
  /** Points, crowns and stamps; off for the one-night Game Night (R-008). */
  pointsEnabled: boolean;
};

const travel = {
  atHome: false,
  maxCrew: 12,
  mainDays: { min: 1, max: 14 },
  preFlightDays: { min: 0, max: 10, skippable: true },
  maxCallNights: 4,
  takeoff: "airport_missions",
  tripSeasonStart: "arrival_button",
  crowningLabel: "Crowning night",
  photosKept: { group: 6, solo: 10 },
  postcardPicksPerPlayer: 2,
  dailyQuest: false,
  journal: false,
  maxFocuses: 0,
  pointsEnabled: true,
} as const satisfies Partial<RoomConfig>;

const atHome = {
  ...travel,
  atHome: true,
  mainDays: { min: 1, max: 7 },
  takeoff: "home_missions",
  tripSeasonStart: "first_experience_day",
  crowningLabel: "Finale night",
} as const satisfies Partial<RoomConfig>;

export const rooms: Record<RoomId, RoomConfig> = {
  trip: {
    ...travel,
    id: "trip",
    modes: ["solo", "crew", "offline"],
    contentTags: ["trip"],
  },
  window_seat: {
    ...travel,
    id: "window_seat",
    modes: ["solo", "crew"],
    maxCrew: 4,
    postcardPicksPerPlayer: 5,
    dailyQuest: true,
    journal: true,
    contentTags: ["trip", "solo"],
  },
  explore_culture: {
    ...atHome,
    id: "explore_culture",
    modes: ["solo", "crew", "offline"],
    maxFocuses: 2,
    contentTags: ["at_home"],
  },
  show_culture: {
    ...atHome,
    id: "show_culture",
    modes: ["solo", "crew", "offline"],
    contentTags: ["at_home"],
  },
  game_night: {
    ...atHome,
    id: "game_night",
    modes: ["crew", "offline"],
    mainDays: { min: 1, max: 1 },
    preFlightDays: { min: 0, max: 0, skippable: false },
    maxCallNights: 0,
    takeoff: "none",
    crowningLabel: "Game night",
    photosKept: { group: 0, solo: 0 },
    postcardPicksPerPlayer: 0,
    contentTags: ["at_home", "trip"],
    pointsEnabled: false,
  },
};

export function roomOf(id: string | null | undefined): RoomConfig {
  return rooms[(roomIds as readonly string[]).includes(id ?? "") ? (id as RoomId) : "trip"];
}
