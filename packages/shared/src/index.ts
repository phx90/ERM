import { z } from "zod";

export const CRITICALITIES = ["BAIXA", "MEDIA", "ALTA"] as const;
export const DEFAULT_STATUSES = [
  "RASCUNHO", "AGUARDANDO AQUISIÇÃO", "EM NEGOCIAÇÃO", "PEDIDO REALIZADO",
  "EM TRANSPORTE", "ENTREGUE", "ATRASADO", "CANCELADO"
] as const;
export const requestItemSchema = z.object({
  productId: z.string().uuid().optional(),
  manualCode: z.string().trim().optional(),
  description: z.string().trim().min(2),
  quantity: z.coerce.number().positive(),
  unit: z.string().trim().min(1),
  criticality: z.enum(CRITICALITIES),
  application: z.string().trim().optional(),
  note: z.string().trim().optional()
});
export const purchaseRequestSchema = z.object({
  requestDate: z.coerce.date(),
  requesterId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  notes: z.string().trim().optional(),
  items: z.array(requestItemSchema).min(1)
});
export type PurchaseRequestInput = z.infer<typeof purchaseRequestSchema>;

export function leadTimeDays(requestedAt: Date, deliveredAt = new Date()): number {
  if (deliveredAt < requestedAt) throw new Error("Data final anterior à solicitação");
  return Math.floor((deliveredAt.getTime() - requestedAt.getTime()) / 86_400_000);
}
