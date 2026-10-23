import { getAiModel } from "@/integrations/ai/index.server";
import { generateText } from "ai";

export async function generateArcadeMix() {
  const ai = getAiModel();
  if (!ai) throw new Error("AI mixes are unavailable right now. Try the sample cards instead.");
  const result = await generateText({
    model: ai.model,
    instructions:
      "Make a single playful, clean, all-ages three-part sample game using only the supplied prompts: Talk Cards (ask one supplied question), Do Wheel (use one supplied action), Show Vote (use a supplied vote). You may reorder and connect, but do not invent new game mechanics, personal facts, drinking or adult content. Return three numbered short lines. No markdown.",
    messages: [
      {
        role: "user",
        content: JSON.stringify([
          "What is one thing a friend might still get wrong about you?",
          "Tell a story in three emojis in twenty seconds",
          "Who told the funniest story? Vote secretly and reveal.",
          "Never have I ever packed the night before a trip",
          "Draw your dream breakfast; let your squad guess",
          "Find a tiny detail nearby and share its story",
        ]),
      },
    ],
    providerOptions: { openai: { store: false } },
  });
  return { text: result.text.slice(0, 700), usage: result.usage, modelId: ai.modelId };
}
