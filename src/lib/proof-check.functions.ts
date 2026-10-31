import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Runs the AI check on one of the caller's proofs that is waiting for it (M3-14) and records the
// verdict with the service role; the database decides what the verdict does (Q3).
export const checkProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => z.object({ proofId: z.string().uuid() }).parse(value))
  .handler(async ({ data, context }) => {
    const { data: proof } = await context.supabase
      .from("proofs")
      .select("id, photo_path, ai_status, body")
      .eq("id", data.proofId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!proof || proof.ai_status !== "pending" || !proof.photo_path) return { verdict: null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkProofPhoto } = await import("@/integrations/ai/proof-check.server");
    const { data: signed } = await supabaseAdmin.storage
      .from("quest-proofs")
      .createSignedUrl(proof.photo_path, 300);
    const result = signed?.signedUrl
      ? await checkProofPhoto({ challenge: proof.body ?? "", photoUrl: signed.signedUrl })
      : { verdict: "unsure" as const, reason: "photo not found", safetyFlags: [] };
    await supabaseAdmin.rpc("record_proof_check", {
      p_proof: proof.id,
      p_verdict: result.verdict,
      p_reason: result.reason ?? "",
      p_flags: result.safetyFlags.length ? { safety: result.safetyFlags } : null,
    });
    return { verdict: result.verdict };
  });
