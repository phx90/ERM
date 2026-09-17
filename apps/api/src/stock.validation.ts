import { BadRequestException } from "@nestjs/common";

export function quantity(value: unknown): number {
  if ((typeof value !== "string" && typeof value !== "number") || !/^\d{1,12}(\.\d{1,3})?$/.test(String(value))) {
    throw new BadRequestException("Informe uma quantidade não negativa, com até três casas decimais.");
  }
  return Number(value);
}
