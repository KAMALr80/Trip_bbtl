import { describe, expect, it } from "vitest";
import fixtures from "../../../supabase/tests/fixtures/wrapup.json";
import { answerProblem } from "./wrapup";

describe("wrap-up answers (shared fixtures with the server)", () => {
  for (const c of fixtures.cases) {
    it(c.name, () => {
      expect(answerProblem(c.answer, c.emoji) === null).toBe(c.ok);
    });
  }
});
