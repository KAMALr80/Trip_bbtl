import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

// The one place AI providers are configured (M0-08). Server only: the key never reaches the client.
// Callers still run spendAiQuota / logAppAi, content-rules RULES and safeContent around every call.
//
// Env:
//   AI_API_KEY   provider key (OpenAI, or any OpenAI-compatible Responses API)
//   AI_MODEL     model id, e.g. the provider's current GPT model; also used for cost estimates
//   AI_BASE_URL  optional; defaults to OpenAI
//
// Transitional: while AI_API_KEY is unset, an existing LOVABLE_API_KEY keeps using the Lovable AI
// gateway with its model id, so AI features keep working until the new key is configured. Remove
// this branch once every environment has AI_API_KEY.

export type AiModel = { model: LanguageModel; modelId: string };

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1";
const LOVABLE_MODEL = "openai/gpt-6-astra";

/** The configured model, or null when AI is not configured (callers show their fallback copy). */
export function getAiModel(): AiModel | null {
  const apiKey = process.env["AI_API_KEY"];
  if (apiKey) {
    const modelId = process.env["AI_MODEL"];
    if (!modelId) {
      console.error("[ai] AI_API_KEY is set but AI_MODEL is not, so AI features are off.");
      return null;
    }
    const baseURL = process.env["AI_BASE_URL"];
    const provider = createOpenAI(baseURL ? { apiKey, baseURL } : { apiKey });
    return { model: provider.responses(modelId), modelId };
  }
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (lovableKey) {
    const provider = createOpenAI({
      baseURL: LOVABLE_GATEWAY,
      apiKey: lovableKey,
      headers: { "Lovable-API-Key": lovableKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    return { model: provider.responses(LOVABLE_MODEL), modelId: LOVABLE_MODEL };
  }
  return null;
}
