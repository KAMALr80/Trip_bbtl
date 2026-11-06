// AI proof checks (M3-14 interface, M6-01 vision model, M6-02 safety flags, Q3).
// One check per proof photo. For Bingo, Scavenger and Photo Challenge proofs it also answers "does
// this photo show the challenge?". The verdict only ever approves (pass) or flags for the crew
// (unsure / fail), never rejects; safety flags hide the photo for review (never delete). Any error,
// a missing model or the kill switch gives "unsure" with no flags, so the crew decides.
// Only the verdict, a short reason and the flag names are stored: no image data, faces or embeddings.
import { z } from "zod";

export type ProofVerdict = {
  verdict: "pass" | "unsure" | "fail";
  reason: string | null;
  safetyFlags: string[];
};

export type ProofCheckInput = {
  challenge: string;
  photoUrl: string;
  /** false: safety check only (proofs that don't need a verdict). */
  needsVerdict?: boolean;
};

export type ProofChecker = (input: ProofCheckInput) => Promise<ProofVerdict>;

/** The categories a photo can be flagged for (R-905). */
export const SAFETY_FLAGS = [
  "nudity",
  "sexual",
  "violence",
  "weapons",
  "drugs",
  "self_harm",
  "hate",
  "personal_info",
  "minor_unsafe",
] as const;

/** Nothing decided by AI: the crew decides (no model, AI paused, or an error). */
export const stubProofChecker: ProofChecker = async () => ({
  verdict: "unsure",
  reason: null,
  safetyFlags: [],
});

const modelAnswer = z.object({
  verdict: z.enum(["pass", "unsure", "fail"]).catch("unsure"),
  reason: z.string().max(300).nullable().catch(null),
  safety: z.array(z.string()).catch([]),
});

/** Read the model's JSON answer. Anything unexpected becomes "unsure" with no flags. */
export function parseVerdict(text: string, needsVerdict = true): ProofVerdict {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  let raw: unknown = null;
  try {
    raw = json ? JSON.parse(json) : null;
  } catch {
    raw = null;
  }
  const parsed = modelAnswer.safeParse(raw);
  if (!parsed.success) return { verdict: "unsure", reason: null, safetyFlags: [] };
  const known = new Set<string>(SAFETY_FLAGS);
  const safetyFlags = [...new Set(parsed.data.safety.map((f) => f.trim().toLowerCase()))].filter(
    (f) => known.has(f),
  );
  return {
    verdict: needsVerdict ? parsed.data.verdict : "unsure",
    reason: parsed.data.reason?.slice(0, 300) ?? null,
    safetyFlags,
  };
}

export const PROOF_CHECK_SYSTEM = [
  "You check photos sent as proof in a family-friendly travel game.",
  'Answer with JSON only: {"verdict":"pass"|"unsure"|"fail","reason":"<= 120 characters","safety":[...]}.',
  'verdict: "pass" only when the photo clearly shows the challenge; "fail" only when it clearly does not; otherwise "unsure".',
  `safety: zero or more of ${SAFETY_FLAGS.join(", ")} when the photo clearly contains them; [] when it is fine.`,
  "Never identify people, guess ages, names or locations, or describe faces.",
].join("\n");

/** The vision model behind the same interface (M6-01). */
export function visionProofChecker(
  model: import("ai").LanguageModel,
  onUsage?: (
    usage: { inputTokens?: number | undefined; outputTokens?: number | undefined } | undefined,
  ) => Promise<void>,
): ProofChecker {
  return async ({ challenge, photoUrl, needsVerdict = true }) => {
    try {
      const { generateText } = await import("ai");
      const result = await generateText({
        model,
        system: PROOF_CHECK_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: needsVerdict
                  ? `Challenge: ${challenge.slice(0, 300)}`
                  : 'Safety check only. Use "unsure" as the verdict.',
              },
              {
                // A "file" part with an image media type (the "image" part is deprecated, B-15).
                type: "file",
                mediaType: "image",
                data: new URL(photoUrl),
                // A small image is enough for both questions and keeps the cost down. The OpenAI
                // provider reads imageDetail from the part, not from the call (B-16).
                providerOptions: { openai: { imageDetail: "low" } },
              },
            ],
          },
        ],
        providerOptions: { openai: { store: false } },
        maxOutputTokens: 200,
      });
      await onUsage?.(result.usage);
      return parseVerdict(result.text, needsVerdict);
    } catch {
      return { verdict: "unsure", reason: null, safetyFlags: [] };
    }
  };
}

export function checkProofPhoto(
  input: ProofCheckInput,
  checker: ProofChecker = stubProofChecker,
): Promise<ProofVerdict> {
  return checker(input);
}
