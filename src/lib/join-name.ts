// The name a player gives when asking to join (N-2), so the Captain can tell who is waiting.
// display-only; server: trip_private.join_trip checks the same length and the safety list.
export const JOIN_NAME_MIN = 2;
export const JOIN_NAME_MAX = 30;

/** Without control characters and extra spaces: what the server stores. */
export function cleanJoinName(value: string): string {
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function joinNameIsValid(value: string): boolean {
  const { length } = [...cleanJoinName(value)];
  return length >= JOIN_NAME_MIN && length <= JOIN_NAME_MAX;
}
