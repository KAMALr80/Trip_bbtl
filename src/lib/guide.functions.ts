import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// The public, read-only guide page (M3-12 / M3-13). No sign-in: the database returns only a
// published guide, with names and photos only for players who opted in; photo links are signed
// here with the service role for an hour.
export const loadPublicGuide = createServerFn({ method: "GET" })
  .validator((value) => z.object({ token: z.string().regex(/^[0-9a-f]{24}$/) }).parse(value))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("public_guide", { p_token: data.token });
    if (error || !rows?.length) return null;
    const paths = rows.map((r) => r.photo_path).filter((p): p is string => !!p);
    const signed = paths.length
      ? ((await supabaseAdmin.storage.from("quest-proofs").createSignedUrls(paths, 3600)).data ??
        [])
      : [];
    const first = rows[0]!;
    return {
      title: first.title,
      place: first.place,
      startDate: first.start_date,
      endDate: first.end_date,
      room: first.room,
      items: rows.map((r) => ({
        day: r.day,
        kind: r.kind,
        author: r.author,
        prompt: r.prompt,
        body: r.body,
        photoUrl: signed.find((s) => s.path === r.photo_path)?.signedUrl ?? null,
      })),
    };
  });
