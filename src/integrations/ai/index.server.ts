import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

// The one place AI providers are configured (M0-08). Server only: the key never reaches the client.
// Callers still run spendAiQuota / logAppAi, content-rules RULES and safeContent around every call.
//
// Env:
//   AI_API_KEY   provider key (OpenAI, or any OpenAI-compatible Responses API)
//   AI_MODEL     model id, e.g. the provider's current GPT model; also used for cost estimates
//   AI_BASE_URL  optional; defaults to OpenAI

export type AiModel = { model: LanguageModel; modelId: string };

/** The configured model, or null when AI is not configured (callers show their fallback copy). */
export function getAiModel(): AiModel | null {
  const apiKey = process.env["AI_API_KEY"];
  if (!apiKey) return null;
  const modelId = process.env["AI_MODEL"];
  if (!modelId) {
    console.error("[ai] AI_API_KEY is set but AI_MODEL is not, so AI features are off.");
    return null;
  }
  const baseURL = process.env["AI_BASE_URL"];
  const provider = createOpenAI(baseURL ? { apiKey, baseURL } : { apiKey });
  return { model: provider.responses(modelId), modelId };
}
