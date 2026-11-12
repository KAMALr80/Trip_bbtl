// What a player gave on the email sign-up form: the Terms version they agreed to and their
// birthday (N-4). Sign-up stores these in the account's metadata. When email confirmation is on,
// sign-up returns no session, so they are recorded on the first signed-in load instead of asking
// the player a second time. The server still checks the age (guard_auth_signup_age, set_my_dob).
import { LEGAL_VERSION } from "./legal";

export type SignupAnswers = { dob: string; teenInvite: string | null };

/** The answers to record, or null when the metadata doesn't hold a complete current-version set. */
export function signupAnswers(
  meta: Record<string, unknown> | null | undefined,
): SignupAnswers | null {
  if (!meta || meta["legal_version"] !== LEGAL_VERSION) return null;
  const dob = meta["birthday"];
  if (typeof dob !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  if (!Number.isFinite(new Date(`${dob}T00:00:00Z`).getTime())) return null;
  const invite = meta["teen_invite"];
  return { dob, teenInvite: typeof invite === "string" && invite.length === 10 ? invite : null };
}

/** Under 18 on `today`, so the birthday goes through the teen-invite path. */
export function isUnder18(dob: string, today = new Date()): boolean {
  const eighteenth = new Date(`${dob}T00:00:00Z`);
  eighteenth.setUTCFullYear(eighteenth.getUTCFullYear() + 18);
  return eighteenth.getTime() > Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
}

type Rpc = (fn: string, args: object) => PromiseLike<{ error: unknown }>;

/** Records the sign-up answers through the same calls the sign-up form makes with a session.
 * True once the Terms are recorded. A birthday the server refuses is asked for again on the
 * birthday screen, which explains why. */
export async function recordSignupAnswers(rpc: Rpc, answers: SignupAnswers): Promise<boolean> {
  const legal = await rpc("accept_legal", { p_version: LEGAL_VERSION });
  if (legal.error) return false;
  if (isUnder18(answers.dob) && answers.teenInvite)
    await rpc("set_teen_dob", {
      p_dob: answers.dob,
      p_agree: true,
      p_invite: answers.teenInvite,
    });
  else await rpc("set_my_dob", { p_dob: answers.dob, p_agree: true });
  return true;
}
