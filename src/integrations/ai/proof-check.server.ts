// AI proof checks (M3-14, Q3). One interface for Bingo, Scavenger and Photo Challenge proofs; the
// verdict only ever approves (pass) or flags for the crew (unsure / fail), never rejects. Until the
// vision model lands in M6-01 every photo comes back "unsure", so the crew decides everything.

export type ProofVerdict = {
  verdict: "pass" | "unsure" | "fail";
  reason: string | null;
  safetyFlags: string[];
};

export type ProofCheckInput = { challenge: string; photoUrl: string };

export type ProofChecker = (input: ProofCheckInput) => Promise<ProofVerdict>;

/** The stub: nothing is decided by AI yet. */
export const stubProofChecker: ProofChecker = async () => ({
  verdict: "unsure",
  reason: null,
  safetyFlags: [],
});

export function checkProofPhoto(
  input: ProofCheckInput,
  checker: ProofChecker = stubProofChecker,
): Promise<ProofVerdict> {
  return checker(input);
}
