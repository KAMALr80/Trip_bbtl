// Checks before an account is deleted (B-31). Pure, so every path is unit-tested; the server function
// passes in the real password check. A stolen but unlocked session shouldn't be enough to delete an
// account: an account with a password proves it again, and one that only signs in with Google (which
// has no password to ask for) must have signed in within the last few minutes.

export const RECENT_SIGN_IN_SECONDS = 15 * 60;

export type DeleteClaims = {
  sub?: string;
  email?: string;
  iat?: number;
  app_metadata?: { provider?: string; providers?: string[] };
  amr?: { method?: string; timestamp?: number }[];
};

export type ReauthResult =
  | { ok: true }
  | { ok: false; code: "PASSWORD_REQUIRED" | "WRONG_PASSWORD" | "SIGN_IN_AGAIN"; message: string };

/** How this account proves itself: a password if it has one, otherwise a fresh sign-in. */
export function reauthMethod(
  appMetadata: DeleteClaims["app_metadata"],
): "password" | "fresh_sign_in" {
  const providers = appMetadata?.providers ?? (appMetadata?.provider ? [appMetadata.provider] : []);
  return providers.includes("email") ? "password" : "fresh_sign_in";
}

const failure = (
  code: Exclude<ReauthResult, { ok: true }>["code"],
  message: string,
): ReauthResult => ({
  ok: false,
  code,
  message: `${code}: ${message}`,
});

export async function checkDeleteReauth(
  claims: DeleteClaims,
  password: string | undefined,
  verifyPassword: (email: string, password: string) => Promise<boolean>,
  nowSeconds: number = Date.now() / 1000,
): Promise<ReauthResult> {
  if (reauthMethod(claims.app_metadata) === "password") {
    if (!password)
      return failure("PASSWORD_REQUIRED", "Enter your password to delete your account.");
    if (!claims.email)
      return failure("SIGN_IN_AGAIN", "Sign out and sign in again, then try once more.");
    let ok = false;
    try {
      ok = await verifyPassword(claims.email, password);
    } catch {
      ok = false;
    }
    return ok ? { ok: true } : failure("WRONG_PASSWORD", "That password isn't right.");
  }
  // amr records when this session actually signed in; refreshing the token doesn't change it.
  const signedInAt = Math.max(0, ...(claims.amr ?? []).map((m) => m.timestamp ?? 0));
  if (nowSeconds - signedInAt > RECENT_SIGN_IN_SECONDS)
    return failure(
      "SIGN_IN_AGAIN",
      "For your security, sign out and sign in again, then delete your account.",
    );
  return { ok: true };
}

/**
 * Trips that stop this player leaving. Checked first, so a refused deletion doesn't leave them
 * half-removed from their other trips.
 */
export function tripsNeedingNewCaptain(
  memberships: { trip_id: string; user_id: string; role: string }[],
  userId: string,
): string[] {
  const captainOf = memberships.filter((m) => m.user_id === userId && m.role === "captain");
  return captainOf
    .filter((c) => memberships.some((m) => m.trip_id === c.trip_id && m.user_id !== userId))
    .map((c) => c.trip_id);
}
