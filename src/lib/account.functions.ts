import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: memberships, error } = await supabase
      .from("trip_members")
      .select("trip_id, role")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    // Captains must hand over the crown (or be the only member) first, so no trip is left without a leader.
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
    }
    for (const f of files)
      if (f.paths.length) await supabaseAdmin.storage.from(f.bucket).remove(f.paths);
    await supabaseAdmin.from("trip_player_cards").delete().eq("user_id", userId);
    const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (delError) throw new Error(delError.message);
    return { ok: true };
  });
