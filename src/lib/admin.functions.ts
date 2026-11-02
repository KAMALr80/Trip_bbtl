import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// M6-05: disable or re-enable an account. Admins only: checked here with the caller's own session,
// then the account is banned / unbanned in Supabase Auth with the service role and the action is
// recorded (record_user_block, which checks the admin again and logs it in admin_actions).
export const setUserDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) =>
    z
      .object({
        userId: z.string().uuid(),
        disabled: z.boolean(),
        note: z.string().trim().min(1).max(500),
      })
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("is_app_admin");
    if (admin !== true) throw new Error("Admins only");
    if (data.userId === context.userId) throw new Error("You can't disable your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { rpcOn } = await import("@/data/rpc-core");
    // Record first (it refuses admins as targets), then change the account in Auth.
    const { error } = await rpcOn(supabaseAdmin, "record_user_block", {
      p_admin: context.userId,
      p_user: data.userId,
      p_disabled: data.disabled,
      p_note: data.note,
    });
    if (error) throw new Error(error.message);
    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.disabled ? "876000h" : "none",
    });
    if (banError) throw new Error(banError.message);
    return { ok: true };
  });
