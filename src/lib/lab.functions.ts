import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BOT_NAMES = [
  "Mango",
  "Zippy",
  "Neon Nia",
  "Kai",
  "Lulu",
  "Rocco",
  "Bea",
  "Taz",
  "Juno",
  "Ollie",
  "Pep",
  "Remy",
  "Suki",
  "Dex",
  "Ivy",
  "Milo",
  "Nova",
  "Ziggy",
  "Coco",
  "Fitz",
  "Gigi",
  "Hugo",
  "Indy",
  "Jazz",
  "Koko",
  "Lux",
  "Momo",
  "Nico",
  "Opal",
  "Pip",
];

type Ctx = { supabase: any; userId: string };

async function assertFounder(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("is_app_admin");
  if (!data) throw new Error("Test Lab is founder-only");
}

async function ensureBots(needed: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { count } = await db
    .from("sandbox_bots")
    .select("user_id", { count: "exact", head: true })
    .is("trip_id", null);
  for (let i = count ?? 0; i < needed; i++) {
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]!;
    const email = `bot-${crypto.randomUUID()}@sandbox.tripjunkie.invalid`;
    // The auth service inserts the row before applying custom app_metadata, so the signup age guard
    // never sees sandbox_bot at insert time. Bots pass the guard like any adult: current Terms + an adult birthday.
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: crypto.randomUUID() + crypto.randomUUID(),
      email_confirm: true,
      app_metadata: { sandbox_bot: true },
      user_metadata: {
        sandbox_bot: true,
        full_name: name,
        legal_version: "2026-10-03",
        birthday: "1990-01-01",
      },
    });
    if (error || !data.user)
      throw new Error(
        error?.message
          ? `Couldn't create a bot player: ${error.message}`
          : "Couldn't create a bot player",
      );
    const { error: e2 } = await db.from("sandbox_bots").insert({ user_id: data.user.id, name });
    if (e2) throw new Error(e2.message);
  }
}

async function wipe(ctx: Ctx, tripId: string) {
  const { data: ids, error } = await ctx.supabase.rpc("lab_delete", { p_trip: tripId });
  if (error) throw new Error(error.message);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  for (const bucket of ["trip-photos", "player-avatars", "quest-proofs"]) {
    const paths = await listAll(supabaseAdmin, bucket, tripId);
    if (paths.length) await supabaseAdmin.storage.from(bucket).remove(paths);
  }
  for (const id of (ids as string[]) ?? []) await supabaseAdmin.auth.admin.deleteUser(id);
}

async function listAll(admin: any, bucket: string, prefix: string): Promise<string[]> {
  const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  const out: string[] = [];
  for (const item of data ?? []) {
    const path = `${prefix}/${item.name}`;
    if (item.id) out.push(path);
    else out.push(...(await listAll(admin, bucket, path)));
  }
  return out;
}

const preset = z.object({
  size: z.union([z.literal(4), z.literal(10), z.literal(15), z.literal(25)]),
  days: z.union([z.literal(3), z.literal(7), z.literal(21)]),
  window: z.union([z.literal(1), z.literal(10), z.literal(45), z.literal(84)]),
});

export const createSandbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => preset.parse(d))
  .handler(async ({ data, context }) => {
    await assertFounder(context);
    await ensureBots(data.size - 1 + 2); // +2 spares for late joins
    const { data: id, error } = await context.supabase.rpc("lab_create", {
      p_size: data.size,
      p_days: data.days,
      p_window: data.window,
    });
    if (error) throw new Error(error.message);
    return { tripId: id as string };
  });

export const prepareLateBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFounder(context);
    await ensureBots(1);
    return { ok: true };
  });

export const deleteSandbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tripId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFounder(context);
    await wipe(context, data.tripId);
    return { ok: true };
  });

export const resetSandbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tripId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFounder(context);
    const { data: p } = await context.supabase
      .from("sandbox_trips")
      .select("size,days,window_days")
      .eq("trip_id", data.tripId)
      .maybeSingle();
    if (!p) throw new Error("That sandbox no longer exists");
    await wipe(context, data.tripId);
    await ensureBots(p.size - 1 + 2);
    const { data: id, error } = await context.supabase.rpc("lab_create", {
      p_size: p.size,
      p_days: p.days,
      p_window: p.window_days,
    });
    if (error) throw new Error(error.message);
    return { tripId: id as string };
  });

const athome = z.object({
  pack: z.enum(["thailand", "mexico", "japan"]),
  length: z.enum(["weekend", "week", "two_weeks"]),
});
export const createAtHomeSandbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => athome.parse(d))
  .handler(async ({ data, context }) => {
    await assertFounder(context);
    await ensureBots(3 + 2);
    const { data: id, error } = await context.supabase.rpc("lab_at_home", {
      p_pack: data.pack,
      p_length: data.length,
    });
    if (error) throw new Error(error.message);
    return { tripId: id as string };
  });
