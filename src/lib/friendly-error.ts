/** Keep diagnostic codes internal; show only the server's plain-language message. */
export function friendlyError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : ((error as { message?: string } | null)?.message ?? "Something went wrong. Try again.");
  return message.replace(/^(?:[A-Z][A-Z0-9_]*:\s*)+/, "");
}
