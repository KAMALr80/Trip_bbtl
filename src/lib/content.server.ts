// No-repeat helpers for trip content. Server only (uses the admin client passed in).
import { hashSeed } from "./trip-games";
import { RULES, safeContent } from "./content-rules";

type Admin = { from: (t: string) => any; rpc: (f: string, a?: object) => any };
export type TextKind = "bingo" | "quest" | "mission";

export const keyOf = (text: string) => `h${hashSeed(text.trim().toLowerCase()).toString(36)}`;

export async function captainTrips(admin: Admin, tripId: string): Promise<string[]> {
  const { data: cap } = await admin.from("trip_members").select("user_id").eq("trip_id", tripId).eq("role", "captain").maybeSingle();
  if (!cap) return [];
  const { data } = await admin.from("trip_members").select("trip_id").eq("user_id", cap.user_id).eq("role", "captain").neq("trip_id", tripId);
  return (data ?? []).map((r: { trip_id: string }) => r.trip_id);
}

export async function seenSets(admin: Admin, tripId: string, kind: string) {
  const others = await captainTrips(admin, tripId);
  const { data } = await admin.from("content_seen").select("trip_id,item_key").eq("kind", kind).in("trip_id", [tripId, ...others]);
  const trip = new Set<string>(), captain = new Set<string>();
  for (const r of (data ?? []) as { trip_id: string; item_key: string }[]) (r.trip_id === tripId ? trip : captain).add(r.item_key);
  const { data: pct } = await admin.rpc("trip_slice_pct", { p_trip: tripId });
  return { trip, captain, slice: typeof pct === "number" ? pct : 100 };
}

/** Preview trips draw from a weekly-rotating slice of each library (FULL = 100%). */
function isoWeek(d = new Date()) { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = t.getUTCFullYear(); return `${y}-${Math.ceil(((+t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)}`; }
export const inSlice = (text: string, pct: number) => pct >= 100 || hashSeed(`${keyOf(text)}:${isoWeek()}`) % 100 < pct;

export async function poolWithVariants(admin: Admin, tripId: string, kind: TextKind, base: string[]) {
  const { data } = await admin.from("content_variants").select("text").eq("trip_id", tripId).eq("kind", kind);
  return Array.from(new Set([...base, ...((data ?? []) as { text: string }[]).map((r) => r.text)]));
}

/** Random among unseen for this trip; then items the Captain's other trips haven't used; repeats only when the pool is exhausted. */
export function pickUnseen(items: string[], seen: { trip: Set<string>; captain: Set<string>; slice?: number }, n: number) {
  const rank = (t: string) => (inSlice(t, seen.slice ?? 100) ? 0 : 4) + (seen.trip.has(keyOf(t)) ? 2 : 0) + (seen.captain.has(keyOf(t)) ? 1 : 0);
  return items.map((t) => ({ t, r: rank(t) + Math.random() * 0.5 })).sort((a, b) => a.r - b.r).slice(0, n).map((x) => x.t);
}

export async function markSeen(admin: Admin, tripId: string, kind: string, texts: string[]) {
  if (!texts.length) return;
  await admin.from("content_seen").upsert(texts.map((t) => ({ trip_id: tripId, kind, item_key: keyOf(t) })), { onConflict: "trip_id,kind,item_key", ignoreDuplicates: true });
}

/** App-paid AI (not the user's limit): returns a list of short strings, or [] on any failure. */
export async function askList(instructions: string, payload: object, tripId: string | null = null, paid?: { log: import("./ai-quota.server").UsageLog }, userId: string | null = null): Promise<string[]> {
  const { getAiModel } = await import("@/integrations/ai/index.server");
  const ai = getAiModel();
  if (!ai) { if (paid) throw new Error("AI unavailable"); return []; }
  // Paid calls were already gated by spend_credits; app-paid top-ups check the guard and fall back to pre-written pools.
  if (!paid && !(await (await import("./ai-quota.server")).appAiAllowed("auto_refresh", tripId, userId))) return [];
  try {
    const { streamText } = await import("ai");
    const result = streamText({ model: ai.model, instructions: `${instructions} ${RULES} Return ONLY a JSON array of strings.`, messages: [{ role: "user", content: JSON.stringify(payload) }], providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", store: false } } });
    const text = await result.text;
    const { logAppAi } = await import("./ai-quota.server");
    if (paid) await paid.log(ai.modelId, await result.usage);
    else await logAppAi(tripId, "auto_refresh", ai.modelId, await result.usage, userId);
    const arr = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? "[]");
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string" && s.trim().length > 3 && s.length <= 200 && safeContent(s)).map((s) => s.trim()) : [];
  } catch (cause) { if (paid) throw cause; return []; }
}

export type CheckinTask = { category: string; title: string; what: string; backstory: string; keywords: string[] };
/** Paid AI for Early Check-In tasks in the card format; throws on failure so the caller refunds. */
export async function askTasks(instructions: string, payload: object, paid: { log: import("./ai-quota.server").UsageLog }): Promise<CheckinTask[]> {
  const { getAiModel } = await import("@/integrations/ai/index.server");
  const ai = getAiModel();
  if (!ai) throw new Error("AI unavailable");
  const { streamText } = await import("ai");
  const result = streamText({ model: ai.model, instructions: `${instructions} ${RULES} Return ONLY a JSON array of objects with keys category, title, what, backstory, keywords (array of 2-4 strings).`, messages: [{ role: "user", content: JSON.stringify(payload) }], providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", store: false } } });
  const text = await result.text;
  await paid.log(ai.modelId, await result.usage);
  const arr = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? "[]") as unknown;
  if (!Array.isArray(arr)) return [];
  return arr.filter((t): t is CheckinTask => !!t && typeof t === "object" && typeof (t as CheckinTask).title === "string" && typeof (t as CheckinTask).what === "string")
    .map((t) => ({ category: String(t.category || "Fresh for your trip").slice(0, 40), title: t.title.trim().slice(0, 80), what: t.what.trim().slice(0, 240), backstory: String(t.backstory || "").trim().slice(0, 400), keywords: (Array.isArray(t.keywords) ? t.keywords : []).filter((k): k is string => typeof k === "string").slice(0, 4) }))
    .filter((t) => [t.title,t.what,t.backstory,...t.keywords].every(safeContent));
}
