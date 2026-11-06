import { aiRequestLimits, getAiModel } from "@/integrations/ai/index.server";
import { streamText } from "ai";
import type { UsageLog } from "./ai-quota.server";

export async function generateTripNames(
  input: {
    destination: string;
    startDate?: string | undefined;
    endDate?: string | undefined;
    tripType?: string | undefined;
  },
  log?: UsageLog,
) {
  const ai = getAiModel();
  if (!ai)
    throw new Error("Trip name suggestions are unavailable right now. Try a name of your own.");
  const result = streamText({
    ...aiRequestLimits(),
    model: ai.model,
    instructions:
      "Suggest exactly three distinctive, short, fun, inclusive group trip names. Trip-neutral: do not assume international travel, flights, passports, drinking, gender, or age. Use the destination and trip type where helpful; dates may inspire a season. Keep it clean. Return ONLY a JSON array of three strings, each under 55 characters. No markdown.",
    messages: [{ role: "user", content: JSON.stringify(input) }],
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  const text = await result.text;
  await log?.(ai.modelId, await result.usage);
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Couldn't come up with names this time. Try again or type your own.");
  let names: unknown;
  try {
    names = JSON.parse(match[0]);
  } catch {
    throw new Error("Couldn't read those suggestions. Try again or type your own.");
  }
  if (
    !Array.isArray(names) ||
    names.length !== 3 ||
    !names.every((name) => typeof name === "string" && name.trim().length > 0 && name.length <= 100)
  )
    throw new Error("Couldn't read those suggestions. Try again or type your own.");
  return names.map((name: string) => name.trim());
}

export async function generateTripMottos(
  input: { name: string; destination: string; tripType?: string | undefined },
  log?: UsageLog,
) {
  const ai = getAiModel();
  if (!ai) throw new Error("Motto ideas are unavailable right now. Try writing your own.");
  const result = streamText({
    ...aiRequestLimits(),
    model: ai.model,
    instructions:
      "Write exactly three short, fun, inclusive trip mottos. Each is one line playing on what the group's trip name means, but NEVER include or repeat the trip name itself and never start with it or a 'Name:' prefix. Trip-neutral: don't assume flights, drinking, gender or age. Keep it clean. Each must be 60 characters or fewer. Return ONLY a JSON array of three strings. No markdown.",
    messages: [{ role: "user", content: JSON.stringify(input) }],
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  const text = await result.text;
  await log?.(ai.modelId, await result.usage);
  const match = text.match(/\[[\s\S]*\]/);
  let list: unknown = null;
  try {
    list = match ? JSON.parse(match[0]) : null;
  } catch {
    list = null;
  }
  if (!Array.isArray(list))
    throw new Error("Couldn't come up with mottos this time. Try again or write your own.");
  const nm = input.name.trim().toLowerCase();
  const strip = (m: string) => {
    let t = m.trim();
    if (nm && t.toLowerCase().startsWith(nm)) t = t.slice(nm.length).replace(/^[\s:–—,.!-]+/, "");
    return t ? t[0]!.toUpperCase() + t.slice(1) : t;
  };
  const out = list
    .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
    .map((m) => strip(m).slice(0, 60))
    .filter(Boolean)
    .slice(0, 3);
  if (!out.length)
    throw new Error("Couldn't come up with mottos this time. Try again or write your own.");
  return out;
}
