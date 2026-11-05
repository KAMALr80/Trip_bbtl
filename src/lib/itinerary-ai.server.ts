import { getAiModel } from "@/integrations/ai/index.server";
import { streamText } from "ai";
import type { UsageLog } from "./ai-quota.server";
import { PDFDocument } from "pdf-lib";
import type { ItineraryDay } from "./itinerary";

export async function extractItinerary(
  input: {
    text?: string | undefined;
    mime?: string | undefined;
    base64?: string | undefined;
    filename?: string | undefined;
    destination: string;
    startDate: string;
    endDate: string;
  },
  log?: UsageLog,
): Promise<ItineraryDay[]> {
  const ai = getAiModel();
  if (!ai) throw new Error("AI extraction is unavailable right now. Try the quick form instead.");
  if (input.base64 && input.mime === "application/pdf") {
    const pdf = await PDFDocument.load(
      Uint8Array.from(atob(input.base64), (c) => c.charCodeAt(0)),
      { ignoreEncryption: false },
    );
    if (pdf.getPageCount() > 3) throw new Error("Please choose a PDF with 3 pages or fewer.");
  }
  const content: Array<
    | { type: "text"; text: string }
    | { type: "file"; data: string; mediaType: string; filename?: string }
  > = [
    {
      type: "text",
      text: `Trip destination: ${input.destination}; dates: ${input.startDate} to ${input.endDate}. Source text: ${input.text ?? ""}`,
    },
  ];
  // A "file" part with an image media type (the AI SDK's "image" part is deprecated, B-15).
  if (input.base64 && input.mime?.startsWith("image/"))
    content.push({ type: "file", data: input.base64, mediaType: input.mime });
  if (input.base64 && input.mime === "application/pdf")
    content.push({
      type: "file",
      filename: input.filename || "itinerary.pdf",
      data: input.base64,
      mediaType: "application/pdf",
    });
  const result = streamText({
    model: ai.model,
    instructions:
      "Extract only itinerary details explicitly present in the source. Return ONLY a JSON array of days, each object exactly {date: YYYY-MM-DD, city: string, note: string, stays: [{name,checkIn,checkOut}], flights: [{date,from,to}], spots: [{name}]}. Dates must fall within the provided trip range. Use empty strings for unknown checkIn/checkOut; do not invent details. A stay may appear on its check-in day only. At most 3 spots per day. For any day describing travel, a flight, an in-air day, or a departure, preserve the original short line in note even if the destination or flight endpoints are unknown. Never infer a flight endpoint. No markdown.",
    messages: [{ role: "user", content }],
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
  const response = await result.text;
  await log?.(ai.modelId, await result.usage);
  const match = response.match(/\[[\s\S]*\]/);
  if (!match)
    throw new Error("Could not read that plan. Try pasting the details or use the quick form.");
  try {
    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) throw new Error("Invalid days");
    return parsed
      .filter(
        (d): d is ItineraryDay =>
          typeof d === "object" &&
          d !== null &&
          typeof d.date === "string" &&
          d.date >= input.startDate &&
          d.date <= input.endDate,
      )
      .slice(0, 90)
      .map((d) => ({
        date: d.date,
        city: String(d.city ?? "").slice(0, 120),
        note: String(d.note ?? "").slice(0, 240),
        stays: Array.isArray(d.stays)
          ? d.stays
              .slice(0, 12)
              .map((s: { name?: string; checkIn?: string; checkOut?: string }) => ({
                name: String(s.name ?? "").slice(0, 160),
                checkIn: String(s.checkIn ?? "").slice(0, 30),
                checkOut: String(s.checkOut ?? "").slice(0, 30),
              }))
              .filter((s: { name: string }) => s.name)
          : [],
        flights: Array.isArray(d.flights)
          ? d.flights
              .slice(0, 12)
              .map((f: { date?: string; from?: string; to?: string }) => ({
                date: String(f.date ?? d.date).slice(0, 10),
                from: String(f.from ?? "").slice(0, 120),
                to: String(f.to ?? "").slice(0, 120),
              }))
              .filter((f: { from: string; to: string }) => f.from && f.to)
          : [],
        spots: Array.isArray(d.spots)
          ? d.spots
              .slice(0, 3)
              .map((s: { name?: string }) => ({ name: String(s.name ?? "").slice(0, 160) }))
              .filter((s: { name: string }) => s.name)
          : [],
      }));
  } catch {
    throw new Error("Could not read that plan. Try pasting the details or use the quick form.");
  }
}
