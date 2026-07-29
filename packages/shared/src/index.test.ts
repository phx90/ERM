import { describe, expect, it } from "vitest";
import { leadTimeDays } from "./index.js";

describe("leadTimeDays", () => {
  it("calcula dias corridos sem valor absoluto", () => {
    expect(leadTimeDays(new Date("2026-01-01T12:00:00Z"), new Date("2026-01-04T12:00:00Z"))).toBe(3);
  });
  it("rejeita datas invertidas", () => {
    expect(() => leadTimeDays(new Date("2026-01-04"), new Date("2026-01-01"))).toThrow();
  });
});
