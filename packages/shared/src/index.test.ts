import { describe, expect, it } from "vitest";
import {
  leadTimeDays,
  purchaseOrderSchema,
  purchaseReceiptSchema,
  supplierSchema,
  materialWithdrawalSchema,
} from "./index.js";

describe("leadTimeDays", () => {
  it("calcula dias corridos sem valor absoluto", () => {
    expect(
      leadTimeDays(
        new Date("2026-01-01T12:00:00Z"),
        new Date("2026-01-04T12:00:00Z"),
      ),
    ).toBe(3);
  });
  it("rejeita datas invertidas", () => {
    expect(() =>
      leadTimeDays(new Date("2026-01-04"), new Date("2026-01-01")),
    ).toThrow();
  });
});

describe("cadastro de fornecedores", () => {
  const supplier = {
    legalName: "Fornecedor Teste Ltda.",
    cnpj: "04.252.011/0001-10",
    contact: "Maria Silva",
    phone: "(11) 3333-4444",
    email: "contato@fornecedor.com.br",
    postalCode: "01310-100",
    street: "Avenida Paulista",
    addressNumber: "1000",
    district: "Bela Vista",
    city: "São Paulo",
    state: "SP",
    country: "Brasil",
  };

  it("aceita CNPJ válido e dados empresariais completos", () => {
    expect(supplierSchema.safeParse(supplier).success).toBe(true);
  });

  it("rejeita CNPJ inválido", () => {
    expect(
      supplierSchema.safeParse({ ...supplier, cnpj: "11.111.111/1111-11" })
        .success,
    ).toBe(false);
  });
});

describe("retirada de materiais", () => {
  const productId = "00000000-0000-4000-8000-000000000002";

  it("aceita uma reserva com materiais e prazo", () => {
    const parsed = materialWithdrawalSchema.parse({
      purpose: "Manutenção preventiva",
      destination: "Oficina",
      workSite: "Obra Central",
      expiresAt: "2026-09-22T12:00:00-03:00",
      items: [{ productId, quantity: "2.5" }],
    });
    expect(parsed.items[0].quantity).toBe(2.5);
  });

  it("rejeita retirada sem material ou com quantidade zero", () => {
    expect(
      materialWithdrawalSchema.safeParse({
        purpose: "Manutenção preventiva",
        destination: "Oficina",
        workSite: "Obra Central",
        expiresAt: "2026-09-22T12:00:00-03:00",
        items: [{ productId, quantity: 0 }],
      }).success,
    ).toBe(false);
  });
});

describe("fluxo de compras", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  it("valida um pedido vinculado à solicitação", () => {
    expect(
      purchaseOrderSchema.parse({
        number: "OC-10",
        supplierName: "Fornecedor Teste",
        expectedAt: "2026-09-30",
        carrier: "Transportadora Teste",
        items: [{ requestItemId: id, quantity: "2.5", unitPrice: "10" }],
      }).items[0].quantity,
    ).toBe(2.5);
  });
  it("rejeita recebimento sem nota fiscal ou com quantidade zero", () => {
    expect(
      purchaseReceiptSchema.safeParse({
        invoiceNumber: "",
        deliveredAt: "2026-09-18",
        items: [{ orderItemId: id, quantity: 0 }],
      }).success,
    ).toBe(false);
  });
});
