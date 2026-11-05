import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Runs the AI check on one of the caller's proof photos (M3-14, M6-01, M6-02) and records the
// result with the service role; the database decides what it does (Q3, R-905).
//  * Bingo, Scavenger and Photo Challenge proofs (ai_status 'pending'): verdict + safety flags.
//  * Every other proof photo: the safety check only, once.
// Behind the AI kill switch and daily caps (ai_gate); with AI off or on any error the verdict is
// "unsure" (the crew decides) and no safety flag is raised (players can still report a photo).
export const checkProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value) => z.object({ proofId: z.string().uuid() }).parse(value))
  .handler(async ({ data, context }) => {
    const { data: proof } = await context.supabase
      .from("proofs")
      .select("id, trip_id, photo_path, ai_status, ai_flags")
      .eq("id", data.proofId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!proof?.photo_path) return { verdict: null };
    const needsVerdict = proof.ai_status === "pending";
    if (!needsVerdict && proof.ai_flags !== null) return { verdict: null }; // already checked
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { rpcOn } = await import("@/data/rpc-core");
    const { checkProofPhoto, stubProofChecker, visionProofChecker } =
      await import("@/integrations/ai/proof-check.server");
    const { getAiModel } = await import("@/integrations/ai/index.server");
    const guard = await import("./ai-quota.server");
    const ai = getAiModel();
    const allowed =
      !!ai && (await guard.appAiAllowed("proof_check", proof.trip_id, context.userId));
    const checker =
      ai && allowed
        ? visionProofChecker(ai.model, (usage) =>
            guard.logAppAi(proof.trip_id, "proof_check", ai.modelId, usage, context.userId),
          )
        : stubProofChecker;
    const { data: challenge } = await rpcOn(supabaseAdmin, "proof_challenge", {
      p_proof: proof.id,
    });
    const { data: signed } = await supabaseAdmin.storage
      .from("quest-proofs")
      .createSignedUrl(proof.photo_path, 300);
    const result = signed?.signedUrl
      ? await checkProofPhoto(
          { challenge: challenge?.[0]?.challenge ?? "", photoUrl: signed.signedUrl, needsVerdict },
          checker,
        )
      : { verdict: "unsure" as const, reason: "photo not found", safetyFlags: [] };
    if (needsVerdict) {
      await rpcOn(supabaseAdmin, "record_proof_check", {
        p_proof: proof.id,
        p_verdict: result.verdict,
        p_reason: result.reason ?? (allowed ? "" : "AI check off"),
        p_flags: { safety: result.safetyFlags },
      });
      return { verdict: result.verdict };
    }
    if (checker !== stubProofChecker) {
      // Mark the photo as checked (so it isn't checked again), then raise any flags.
      await supabaseAdmin
        .from("proofs")
        .update({ ai_flags: { safety: result.safetyFlags, safety_only: true } })
        .eq("id", proof.id);
      if (result.safetyFlags.length)
        await rpcOn(supabaseAdmin, "record_photo_safety", {
          p_proof: proof.id,
          p_flags: result.safetyFlags,
        });
    }
    return { verdict: null };
  });
