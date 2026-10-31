import { describe, expect, it } from "vitest";
import { flags } from "./flags";

describe("flags", () => {
  it("keeps unfinished features off unless the build turns them on", () => {
    expect(flags.map).toBe(false);
    expect(flags.serviceWorker).toBe(false);
  });
});
