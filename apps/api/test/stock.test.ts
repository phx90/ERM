import { describe, expect, it } from "vitest";
import { quantity } from "../src/stock.validation.js";

describe("quantidades de estoque", () => {
  it("aceita zero, inteiros e até três casas decimais", () => {
    expect(quantity(0)).toBe(0);
    expect(quantity("12.345")).toBe(12.345);
    expect(quantity("999999999999.999")).toBe(999999999999.999);
  });
  it.each([
    null,
    undefined,
    "",
    " ",
    -1,
    "-0.1",
    "1.2345",
    "1e3",
    "1,5",
    Infinity,
    NaN,
    {},
    true,
    "1000000000000",
  ])("rejeita quantidade inválida: %s", (value) => {
    expect(() => quantity(value)).toThrow();
  });
});
