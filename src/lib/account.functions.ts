import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkDeleteReauth, tripsNeedingNewCaptain, type DeleteClaims } from "./account-delete";

/** True if this email and password sign in. The extra session is ended straight away. */
async function passwordIsRight(email: string, password: string) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return false;
  const { createClient } = await import("@supabase/supabase-js");
  const check = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await check.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;
  await check.auth.signOut({ scope: "local" }).catch(() => undefined);
  return true;
}

async function listAll(
  admin: {
    storage: {
      from: (b: string) => {
        list: (
          p: string,
          o?: object,
        ) => Promise<{ data: { name: string; id: string | null }[] | null }>;
      };
    };
  },
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  const out: string[] = [];
  for (const item of data ?? []) {
    const path = `${prefix}/${item.name}`;
    if (item.id) out.push(path);
    else out.push(...(await listAll(admin, bucket, path)));
  }
  return out;
}

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value) => z.object({ password: z.string().max(200).optional() }).parse(value))
  .handler(async ({ context, data: input }) => {
    const { supabase, userId } = context;
    // B-31: a session alone isn't enough. Checked before anything changes.
    const reauth = await checkDeleteReauth(
      context.claims as DeleteClaims,
      input.password,
      passwordIsRight,
    );
    if (!reauth.ok) throw new Error(reauth.message);
    const { data: memberships, error } = await supabase
      .from("trip_members")
      .select("trip_id, role")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    // Captains must hand over the crown (or be the only member) first, so no trip is left without a
    // leader. Checked before leaving any trip, so a refusal doesn't leave the player half-removed.
    const led = (memberships ?? []).filter((m) => m.role === "captain").map((m) => m.trip_id);
    if (led.length) {
      const { data: crews, error: crewError } = await supabase
        .from("trip_members")
        .select("trip_id, user_id, role")
        .in("trip_id", led);
      if (crewError) throw new Error(crewError.message);
      if (tripsNeedingNewCaptain(crews ?? [], userId).length)
        throw new Error("Pass the crown or remove other members from your trips first.");
    }
    for (const m of memberships ?? []) {
      const { error: leaveError } = await supabase.rpc("leave_trip", { p_trip: m.trip_id });
      if (leaveError)
        throw new Error(
          `Pass the crown or remove other members from your trips first (${leaveError.message}).`,
        );
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tripIds = (memberships ?? []).map((m) => m.trip_id);
    const files: { bucket: string; paths: string[] }[] = [
      {
        bucket: "player-avatars",
        paths: await listAll(supabaseAdmin as never, "player-avatars", `account/${userId}`),
      },
      {
        bucket: "bug-screenshots",
        paths: await listAll(supabaseAdmin as never, "bug-screenshots", userId),
      },
    ];
    for (const t of tripIds) {
      files.push({
        bucket: "trip-photos",
        paths: await listAll(supabaseAdmin as never, "trip-photos", `${t}/${userId}`),
      });
      files.push({
        bucket: "player-avatars",
        paths: await listAll(supabaseAdmin as never, "player-avatars", `${t}/${userId}`),
      });
      // M6-04: the new engine's proof photos and Window Seat guide photos go too.
      files.push({
        bucket: "quest-proofs",
        paths: await listAll(supabaseAdmin as never, "quest-proofs", `${t}/${userId}`),
      });
      files.push({
        bucket: "window-guide",
        paths: await listAll(supabaseAdmin as never, "window-guide", `${t}/${userId}`),
      });
    }
    for (const f of files)
      if (f.paths.length) await supabaseAdmin.storage.from(f.bucket).remove(f.paths);
    await supabaseAdmin.from("trip_player_cards").delete().eq("user_id", userId);
    const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (delError) throw new Error(delError.message);
    return { ok: true };
  });
