import { z } from "zod";

export const CRITICALITIES = ["BAIXA", "MEDIA", "ALTA"] as const;
export const DEFAULT_STATUSES = [
  "RASCUNHO",
  "AGUARDANDO AQUISIÇÃO",
  "EM NEGOCIAÇÃO",
  "PEDIDO REALIZADO",
  "EM TRANSPORTE",
  "ENTREGUE",
  "ATRASADO",
  "CANCELADO",
] as const;
export const requestItemSchema = z.object({
  productId: z.string().uuid().optional(),
  manualCode: z.string().trim().optional(),
  description: z.string().trim().min(2),
  quantity: z.coerce.number().positive(),
  unit: z.string().trim().min(1),
  criticality: z.enum(CRITICALITIES),
  application: z.string().trim().optional(),
  note: z.string().trim().optional(),
});
export const purchaseRequestSchema = z.object({
  requestDate: z.coerce.date(),
  requesterOriginal: z
    .string()
    .trim()
    .min(2, "Informe o nome do solicitante.")
    .max(120, "O nome do solicitante deve ter no máximo 120 caracteres."),
  requesterId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  notes: z.string().trim().optional(),
  items: z.array(requestItemSchema).min(1),
});
export type PurchaseRequestInput = z.infer<typeof purchaseRequestSchema>;

export const productRegistrationRequestSchema = z.object({
  description: z.string().trim().min(3).max(500),
  unit: z.string().trim().min(1).max(20),
  references: z.string().trim().min(2).max(2000),
  referenceLinks: z.array(z.string().trim().url()).min(1).max(20),
});
export type ProductRegistrationRequestInput = z.infer<
  typeof productRegistrationRequestSchema
>;

function validCnpj(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;
  const calculate = (length: number) => {
    let sum = 0;
    let weight = length - 7;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return (
    calculate(12) === Number(digits[12]) && calculate(13) === Number(digits[13])
  );
}

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .transform((value) => value || undefined);

export const supplierSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  tradeName: optionalText(160),
  cnpj: z.string().trim().refine(validCnpj, "Informe um CNPJ válido."),
  stateRegistration: optionalText(30),
  municipalRegistration: optionalText(30),
  contact: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(30),
  email: z.string().trim().email().max(160),
  postalCode: z.string().trim().min(8).max(10),
  street: z.string().trim().min(2).max(180),
  addressNumber: z.string().trim().min(1).max(20),
  complement: optionalText(100),
  district: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().length(2),
  country: z.string().trim().min(2).max(80).default("Brasil"),
  website: z
    .union([z.string().trim().url(), z.literal("")])
    .optional()
    .transform((value) => value || undefined),
  paymentTerms: optionalText(200),
  note: optionalText(1000),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const materialWithdrawalSchema = z.object({
  purpose: z.string().trim().min(3).max(500),
  destination: z.string().trim().min(2).max(160),
  workSite: z.string().trim().min(2).max(160),
  expiresAt: z.coerce.date(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.coerce.number().positive().max(999_999_999_999.999),
      }),
    )
    .min(1)
    .max(100),
});

export const materialWithdrawalCancelSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const positiveQuantity = z.coerce.number().positive().max(999_999_999_999.999);
const optionalDate = z
  .union([z.coerce.date(), z.literal("")])
  .optional()
  .transform((value) => (value === "" ? undefined : value));

export const purchaseOrderSchema = z.object({
  number: z.string().trim().min(1).max(60),
  supplierName: z.string().trim().min(2).max(160),
  acquiredAt: optionalDate,
  expectedAt: z.coerce.date(),
  carrier: z.string().trim().min(2).max(160),
  note: z.string().trim().max(1000).optional(),
  items: z
    .array(
      z.object({
        requestItemId: z.string().uuid(),
        quantity: positiveQuantity,
        unitPrice: z.coerce
          .number()
          .nonnegative()
          .max(999_999_999_999.9999)
          .optional(),
      }),
    )
    .min(1),
});

export const purchaseReceiptSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(80),
  deliveredAt: z.coerce.date(),
  note: z.string().trim().max(1000).optional(),
  items: z
    .array(
      z.object({ orderItemId: z.string().uuid(), quantity: positiveQuantity }),
    )
    .min(1),
});

export function leadTimeDays(
  requestedAt: Date,
  deliveredAt = new Date(),
): number {
  if (deliveredAt < requestedAt)
    throw new Error("Data final anterior à solicitação");
  return Math.floor(
    (deliveredAt.getTime() - requestedAt.getTime()) / 86_400_000,
  );
}
