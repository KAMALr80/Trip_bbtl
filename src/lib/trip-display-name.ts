/** Hide legacy leading place emoji on trip titles without changing the stored value. */
export function tripDisplayName(name: string) {
  return (
    name
      .replace(
        /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\uFE0F|\u200D|\s)+/u,
        "",
      )
      .trimStart() || name
  );
}
