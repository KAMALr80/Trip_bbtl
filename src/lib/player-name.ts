// A name for anyone who appears in a trip's shared history. Someone with neither a card nor a place
// on the roster deleted their account: their points and crowns stay, under the label passed in.
type Named = { user_id: string; game_name?: string | null };
type Rostered = { user_id: string; display_name?: string | null };

export function playerName(
  cards: readonly Named[],
  members: readonly Rostered[],
  id: string | null | undefined,
  formerPlayer: string,
): string {
  return (
    cards.find((c) => c.user_id === id)?.game_name ||
    members.find((m) => m.user_id === id)?.display_name ||
    formerPlayer
  );
}
