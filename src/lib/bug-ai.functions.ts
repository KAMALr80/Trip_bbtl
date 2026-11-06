import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Row = {
  id: string;
  page: string;
  description: string;
  issue_id: string | null;
  issue_title: string | null;
};

/** Founder-only: asks the app's AI which other reports look like the same bug. Sends text + screen only — never screenshots, emails or names. */
export const suggestSimilarReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ reportId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const admin = await sb.rpc("is_app_admin");
    if (admin.error || admin.data !== true) throw new Error("Founder only.");
    const list = await sb.rpc("founder_bug_reports");
    if (list.error) throw new Error(list.error.message);
    const rows = (list.data as Row[]) ?? [];
    const target = rows.find((r) => r.id === data.reportId);
    if (!target) throw new Error("Report not found.");
    const scrub = (s: string) =>
      s
        .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
        .replace(/https?:\/\/\S+/g, "[link]")
        .slice(0, 400);
    const others = rows
      .filter((r) => r.id !== target.id)
      .slice(0, 120)
      .map((r) => ({ id: r.id, screen: r.page, text: scrub(r.description), issue: r.issue_title }));
    if (!others.length) return { ids: [] as string[] };
    const { aiRequestLimits, getAiModel } = await import("@/integrations/ai/index.server");
    const ai = getAiModel();
    if (!ai) throw new Error("AI is unavailable right now.");
    const guard = await import("./ai-quota.server");
    if (!(await guard.appAiAllowed("bug_triage", null, context.userId)))
      throw new Error(guard.AI_BREAK);
    const { generateText } = await import("ai");
    const model = ai.modelId;
    const result = await generateText({
      ...aiRequestLimits(),
      model: ai.model,
      system:
        "You triage bug reports for a mobile app. Given a TARGET report and a list of OTHER reports, return ONLY a JSON array of the ids of OTHER reports that most likely describe the same underlying bug (max 8). Return [] if none. No markdown.",
      prompt: JSON.stringify({
        target: { screen: target.page, text: scrub(target.description) },
        others,
      }),
      providerOptions: { openai: { store: false } },
    });
    const { logAppAi } = await import("./ai-quota.server");
    await logAppAi(null, "bug_triage", model, result.usage, context.userId);
    const m = result.text.match(/\[[\s\S]*\]/);
    let ids: unknown = [];
    try {
      ids = m ? JSON.parse(m[0]) : [];
    } catch {
      ids = [];
    }
    const valid = new Set(others.map((o) => o.id));
    return {
      ids: Array.isArray(ids)
        ? ids.filter((x): x is string => typeof x === "string" && valid.has(x)).slice(0, 8)
        : [],
    };
  });
