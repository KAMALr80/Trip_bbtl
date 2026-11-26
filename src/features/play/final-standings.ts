// Baggage Claim "Final standings" (founder review). Points belong to one season and each season is
// its own race for its crown (R-501, R-505), so the card and the list both read season by season:
// Trip Season (Jet Setter) first, then Pre-Flight (Early Bird). Nothing adds the two seasons up.
// Places come from the server (trip_private.standings: points, then Showcase points, then the
// earliest finish, R-506); without one, equal points share a place.

export type Season = "trip_season" | "preflight";
/** One player's points in one season, with the server's place when it sent one. */
export type SeasonRow = { user_id: string; total: number; rank?: number | undefined };
export type RankedRow = { user_id: string; total: number; rank: number };
export type Race = { season: Season; rows: RankedRow[] };
export type FinalStandings = {
  races: Race[];
  /** My place in the first race: the trip's last one I'm on the board for. */
  mine: { season: Season; rank: number; count: number; points: number } | null;
};

/** A season's board in place order; equal points share a place when the server sent none. */
export function rankSeason(rows: SeasonRow[]): RankedRow[] {
  const hasServerRank = rows.length > 0 && rows.every((r) => typeof r.rank === "number");
  const ordered = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) =>
      hasServerRank
        ? (a.r.rank as number) - (b.r.rank as number) || a.i - b.i
        : b.r.total - a.r.total || a.i - b.i,
    );
  let place = 0;
  return ordered.map(({ r }, i) => {
    if (hasServerRank) place = r.rank as number;
    else if (i === 0 || r.total !== ordered[i - 1]!.r.total) place = i + 1;
    return { user_id: r.user_id, total: r.total, rank: place };
  });
}

export function finalStandings(
  preflight: SeasonRow[],
  tripSeason: SeasonRow[],
  userId: string,
): FinalStandings {
  const races: Race[] = (
    [
      { season: "trip_season", rows: rankSeason(tripSeason) },
      { season: "preflight", rows: rankSeason(preflight) },
    ] as Race[]
  ).filter((race) => race.rows.length > 0);
  const first = races[0];
  const me = first?.rows.find((r) => r.user_id === userId);
  return {
    races,
    mine:
      first && me
        ? { season: first.season, rank: me.rank, count: first.rows.length, points: me.total }
        : null,
  };
}
