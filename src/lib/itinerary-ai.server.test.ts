import { afterEach, describe, expect, it, vi } from "vitest";
import { extractItinerary } from "./itinerary-ai.server";

// The request the itinerary import sends for an uploaded photo (B-15). A dummy key and a fetch that
// records the body and refuses it: no network, no paid call.
describe("extractItinerary request (B-15)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends an uploaded photo as an image with its own media type", async () => {
    vi.stubEnv("AI_API_KEY", "test");
    vi.stubEnv("AI_MODEL", "test-model");
    vi.stubEnv("AI_BASE_URL", "");
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ error: { message: "test stop" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    });
    const base64 = "iVBORw0KGgo=";
    await expect(
      extractItinerary({
        mime: "image/png",
        base64,
        destination: "Lisbon",
        startDate: "2026-12-01",
        endDate: "2026-12-04",
      }),
    ).rejects.toThrow();
    expect(bodies).toHaveLength(1);
    const input = bodies[0]!["input"] as Array<{ role: string; content: unknown }>;
    expect(input.find((m) => m.role === "user")?.content).toContainEqual({
      type: "input_image",
      image_url: `data:image/png;base64,${base64}`,
    });
  });
});
