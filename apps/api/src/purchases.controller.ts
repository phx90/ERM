import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { purchaseOrderSchema, purchaseReceiptSchema } from "@compras/shared";
import { AuthGuard } from "./auth.js";
import { PrismaService } from "./prisma.service.js";

type Authed = Request & {
  user: { sub: string; organizationId: string; role: string; name: string };
};
const purchaseWriters = ["ADMIN", "COMPRAS"];
const receiptWriters = ["ADMIN", "ALMOXARIFADO"];

function requireRole(req: Authed, roles: string[]) {
  if (!roles.includes(req.user.role))
    throw new ForbiddenException(
      "Seu perfil não permite realizar esta operação.",
    );
}

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

@Controller("purchases")
@UseGuards(AuthGuard)
export class PurchasesController {
  constructor(private db: PrismaService) {}

  private async usersById(organizationId: string, ids: string[]) {
    const users = await this.db.user.findMany({
      where: { organizationId, id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(users.map((user) => [user.id, user]));
  }

  private async statusIds(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const statuses = await tx.requestStatus.findMany({
      where: { organizationId, active: true },
    });
    return Object.fromEntries(statuses.map((status) => [status.code, status]));
  }

  private async refreshRequests(
    tx: Prisma.TransactionClient,
    organizationId: string,
    requestIds: string[],
  ) {
    const uniqueIds = [...new Set(requestIds)];
    for (const requestId of uniqueIds) {
      const items = await tx.purchaseRequestItem.findMany({
        where: { requestId, deletedAt: null },
        include: { status: true },
      });
      const labels = [...new Set(items.map((item) => item.status.label))];
      const aggregateStatus =
        labels.length === 1
          ? labels[0]
          : items.every((item) => item.status.terminal)
            ? "CONCLUÍDA"
            : "EM ANDAMENTO";
      await tx.purchaseRequest.updateMany({
        where: { id: requestId, organizationId },
        data: { aggregateStatus, version: { increment: 1 } },
      });
    }
  }

  @Get("demand")
  async demand(@Req() req: Authed, @Query("q") q = "") {
    const items = await this.db.purchaseRequestItem.findMany({
      where: {
        deletedAt: null,
        request: { organizationId: req.user.organizationId, deletedAt: null },
        status: { code: { notIn: ["CANCELADO", "ENTREGUE"] } },
        ...(q.trim()
          ? {
              OR: [
                { description: { contains: q.trim(), mode: "insensitive" } },
                { manualCode: { contains: q.trim(), mode: "insensitive" } },
                {
                  request: {
                    number: { contains: q.trim(), mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        request: {
          select: {
            id: true,
            number: true,
            requestDate: true,
            requesterOriginal: true,
            createdBy: { select: { id: true, name: true } },
          },
        },
        product: { select: { id: true, code: true } },
        status: true,
      },
      orderBy: [{ request: { requestDate: "asc" } }, { createdAt: "asc" }],
      take: 500,
    });
    return items
      .filter((item) => item.requestedQuantity.gt(item.purchasedQuantity))
      .map((item) => ({
        ...item,
        openQuantity: item.requestedQuantity.minus(item.purchasedQuantity),
      }));
  }

  @Get("orders")
  async orders(@Req() req: Authed, @Query("q") q = "") {
    const orders = await this.db.purchaseOrder.findMany({
      where: {
        organizationId: req.user.organizationId,
        deletedAt: null,
        ...(q.trim()
          ? {
              OR: [
                { number: { contains: q.trim(), mode: "insensitive" } },
                {
                  supplier: {
                    legalName: { contains: q.trim(), mode: "insensitive" },
                  },
                },
                {
                  deliveries: {
                    some: {
                      invoiceNumber: {
                        contains: q.trim(),
                        mode: "insensitive",
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        supplier: true,
        items: {
          include: {
            deliveryItems: true,
            allocations: {
              include: {
                requestItem: {
                  include: {
                    request: {
                      select: {
                        number: true,
                        requesterOriginal: true,
                        createdBy: { select: { id: true, name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        deliveries: { orderBy: { deliveredAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const users = await this.usersById(
      req.user.organizationId,
      orders.flatMap((order) => [
        order.buyerId,
        ...order.deliveries.map((delivery) => delivery.receivedById),
      ]),
    );
    return orders.map((order) => ({
      ...order,
      createdBy: users.get(order.buyerId) || {
        id: order.buyerId,
        name: "Usuário não encontrado",
      },
      deliveries: order.deliveries.map((delivery) => ({
        ...delivery,
        receivedBy: users.get(delivery.receivedById) || {
          id: delivery.receivedById,
          name: "Usuário não encontrado",
        },
      })),
      items: order.items.map((item) => ({
        ...item,
        receivedQuantity: item.deliveryItems.reduce(
          (sum, delivery) => sum.plus(delivery.quantity),
          new Prisma.Decimal(0),
        ),
        openQuantity: item.quantity.minus(
          item.deliveryItems.reduce(
            (sum, delivery) => sum.plus(delivery.quantity),
            new Prisma.Decimal(0),
          ),
        ),
      })),
    }));
  }

  @Get("orders/by-number/:number")
  async orderByNumber(@Req() req: Authed, @Param("number") number: string) {
    const order = await this.db.purchaseOrder.findFirst({
      where: {
        organizationId: req.user.organizationId,
        deletedAt: null,
        number: { equals: number.trim(), mode: "insensitive" },
      },
      include: {
        supplier: true,
        deliveries: { orderBy: { deliveredAt: "desc" } },
        items: {
          include: {
            product: { select: { code: true } },
            deliveryItems: true,
            allocations: {
              include: {
                requestItem: {
                  include: {
                    request: {
                      select: {
                        number: true,
                        requesterOriginal: true,
                        createdBy: { select: { id: true, name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException("Pedido não encontrado.");
    const users = await this.usersById(req.user.organizationId, [
      order.buyerId,
      ...order.deliveries.map((delivery) => delivery.receivedById),
    ]);
    return {
      ...order,
      createdBy: users.get(order.buyerId) || {
        id: order.buyerId,
        name: "Usuário não encontrado",
      },
      deliveries: order.deliveries.map((delivery) => ({
        ...delivery,
        receivedBy: users.get(delivery.receivedById) || {
          id: delivery.receivedById,
          name: "Usuário não encontrado",
        },
      })),
      items: order.items.map((item) => {
        const receivedQuantity = item.deliveryItems.reduce(
          (sum, delivery) => sum.plus(delivery.quantity),
          new Prisma.Decimal(0),
        );
        return {
          ...item,
          receivedQuantity,
          openQuantity: item.quantity.minus(receivedQuantity),
        };
      }),
    };
  }

  @Post("orders")
  async createOrder(@Req() req: Authed, @Body() raw: unknown) {
    requireRole(req, purchaseWriters);
    const parsed = purchaseOrderSchema.safeParse(raw);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues.map((issue) => issue.message),
      );
    const input = parsed.data;
    if (
      new Set(input.items.map((item) => item.requestItemId)).size !==
      input.items.length
    )
      throw new BadRequestException(
        "Cada item da solicitação deve aparecer apenas uma vez no pedido.",
      );
    return this.db.$transaction(async (tx) => {
      const number = input.number.trim().toUpperCase();
      if (
        await tx.purchaseOrder.findFirst({
          where: {
            organizationId: req.user.organizationId,
            number: { equals: number, mode: "insensitive" },
            deletedAt: null,
          },
        })
      ) {
        throw new ConflictException("Já existe um pedido com este número.");
      }
      const ids = input.items.map((item) => item.requestItemId).sort();
      await tx.$queryRaw`SELECT id FROM "PurchaseRequestItem" WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
      const requestItems = await tx.purchaseRequestItem.findMany({
        where: {
          id: { in: ids },
          deletedAt: null,
          request: { organizationId: req.user.organizationId, deletedAt: null },
        },
        include: { request: true, product: true, status: true },
      });
      if (requestItems.length !== ids.length)
        throw new BadRequestException(
          "Um ou mais itens da solicitação não foram encontrados.",
        );
      const byId = new Map(requestItems.map((item) => [item.id, item]));
      for (const item of input.items) {
        const requested = byId.get(item.requestItemId)!;
        if (["CANCELADO", "ENTREGUE"].includes(requested.status.code))
          throw new BadRequestException(
            `O item ${requested.description} não está disponível para compra.`,
          );
        if (
          new Prisma.Decimal(item.quantity).gt(
            requested.requestedQuantity.minus(requested.purchasedQuantity),
          )
        ) {
          throw new BadRequestException(
            `A quantidade de ${requested.description} supera o saldo ainda não pedido.`,
          );
        }
      }
      const supplierName = input.supplierName.trim();
      const supplier = await tx.supplier.findUnique({
        where: {
          organizationId_normalizedName: {
            organizationId: req.user.organizationId,
            normalizedName: normalized(supplierName),
          },
        },
      });
      if (!supplier?.active)
        throw new BadRequestException(
          "Fornecedor não cadastrado ou inativo. Cadastre-o no módulo Fornecedores antes de gerar a ordem.",
        );
      const totalValue = input.items.reduce(
        (sum, item) =>
          sum.plus(new Prisma.Decimal(item.quantity).mul(item.unitPrice || 0)),
        new Prisma.Decimal(0),
      );
      const created = await tx.purchaseOrder.create({
        data: {
          organizationId: req.user.organizationId,
          number,
          supplierId: supplier.id,
          buyerId: req.user.sub,
          acquiredAt: input.acquiredAt || new Date(),
          expectedAt: input.expectedAt,
          carrier: input.carrier || null,
          status: "EMITIDA",
          note: input.note || null,
          totalValue,
          items: {
            create: input.items.map((item) => {
              const source = byId.get(item.requestItemId)!;
              return {
                productId: source.productId,
                description: source.description,
                unit: source.unit,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                allocations: {
                  create: {
                    requestItemId: item.requestItemId,
                    quantity: item.quantity,
                  },
                },
              };
            }),
          },
        },
        include: { supplier: true, items: { include: { allocations: true } } },
      });
      const statuses = await this.statusIds(tx, req.user.organizationId);
      if (!statuses.PEDIDO_REALIZADO)
        throw new BadRequestException(
          "Status PEDIDO REALIZADO não configurado.",
        );
      for (const item of input.items) {
        const source = byId.get(item.requestItemId)!;
        const purchasedQuantity = source.purchasedQuantity.plus(item.quantity);
        await tx.purchaseRequestItem.update({
          where: { id: source.id },
          data: {
            purchasedQuantity,
            statusId: statuses.PEDIDO_REALIZADO.id,
            version: { increment: 1 },
          },
        });
        await tx.statusHistory.create({
          data: {
            requestItemId: source.id,
            previousStatus: source.status.label,
            newStatus: statuses.PEDIDO_REALIZADO.label,
            userId: req.user.sub,
            note: `Pedido ${number}`,
          },
        });
      }
      await this.refreshRequests(
        tx,
        req.user.organizationId,
        requestItems.map((item) => item.requestId),
      );
      await tx.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          userId: req.user.sub,
          action: "PURCHASE_ORDER_CREATE",
          entity: "PurchaseOrder",
          entityId: created.id,
          after: created,
          changedFields: ["number", "supplierId", "carrier", "items"],
          correlationId: String(
            req.headers["x-correlation-id"] || randomUUID(),
          ),
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
      return created;
    });
  }

  @Post("orders/:id/receipts")
  async receive(
    @Req() req: Authed,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    requireRole(req, receiptWriters);
    const parsed = purchaseReceiptSchema.safeParse(raw);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues.map((issue) => issue.message),
      );
    const input = parsed.data;
    if (
      new Set(input.items.map((item) => item.orderItemId)).size !==
      input.items.length
    )
      throw new BadRequestException(
        "Cada item do pedido deve aparecer apenas uma vez no recebimento.",
      );
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
      const order = await tx.purchaseOrder.findFirst({
        where: { id, organizationId: req.user.organizationId, deletedAt: null },
        include: {
          items: {
            include: {
              deliveryItems: true,
              allocations: {
                include: { requestItem: { include: { status: true } } },
              },
            },
          },
        },
      });
      if (!order) throw new NotFoundException("Pedido não encontrado.");
      if (order.status === "CANCELADA")
        throw new ConflictException(
          "Não é possível receber um pedido cancelado.",
        );
      const invoiceNumber = input.invoiceNumber.trim().toUpperCase();
      if (
        await tx.delivery.findUnique({
          where: { orderId_invoiceNumber: { orderId: id, invoiceNumber } },
        })
      )
        throw new ConflictException(
          "Esta Nota Fiscal já foi registrada para o pedido.",
        );
      const byId = new Map(order.items.map((item) => [item.id, item]));
      for (const received of input.items) {
        const item = byId.get(received.orderItemId);
        if (!item)
          throw new BadRequestException(
            "Um item informado não pertence ao pedido.",
          );
        const previous = item.deliveryItems.reduce(
          (sum, delivery) => sum.plus(delivery.quantity),
          new Prisma.Decimal(0),
        );
        if (
          new Prisma.Decimal(received.quantity).gt(
            item.quantity.minus(previous),
          )
        )
          throw new BadRequestException(
            `A quantidade recebida de ${item.description} supera o saldo do pedido.`,
          );
      }
      const totalOpenBefore = order.items.reduce(
        (sum, item) =>
          sum.plus(
            item.quantity.minus(
              item.deliveryItems.reduce(
                (value, delivery) => value.plus(delivery.quantity),
                new Prisma.Decimal(0),
              ),
            ),
          ),
        new Prisma.Decimal(0),
      );
      const receivedNow = input.items.reduce(
        (sum, item) => sum.plus(item.quantity),
        new Prisma.Decimal(0),
      );
      const partial = receivedNow.lt(totalOpenBefore);
      const delivery = await tx.delivery.create({
        data: {
          orderId: id,
          deliveredAt: input.deliveredAt,
          receivedById: req.user.sub,
          invoiceNumber,
          note: input.note || null,
          partial,
        },
      });
      const statuses = await this.statusIds(tx, req.user.organizationId);
      const affectedRequests: string[] = [];
      for (const received of input.items) {
        const orderItem = byId.get(received.orderItemId)!;
        const deliveryItem = await tx.deliveryItem.create({
          data: {
            deliveryId: delivery.id,
            orderItemId: orderItem.id,
            quantity: received.quantity,
          },
        });
        let remaining = new Prisma.Decimal(received.quantity);
        for (const allocation of orderItem.allocations) {
          if (remaining.lte(0)) break;
          const requestOpen = allocation.requestItem.requestedQuantity.minus(
            allocation.requestItem.deliveredQuantity,
          );
          const applied = Prisma.Decimal.min(
            remaining,
            requestOpen,
            allocation.quantity,
          );
          if (applied.lte(0)) continue;
          const deliveredQuantity =
            allocation.requestItem.deliveredQuantity.plus(applied);
          const status = deliveredQuantity.gte(
            allocation.requestItem.requestedQuantity,
          )
            ? statuses.ENTREGUE
            : statuses.EM_TRANSPORTE;
          if (!status)
            throw new BadRequestException(
              "Status de recebimento não configurado.",
            );
          await tx.purchaseRequestItem.update({
            where: { id: allocation.requestItemId },
            data: {
              deliveredQuantity: { increment: applied },
              statusId: status.id,
              version: { increment: 1 },
            },
          });
          await tx.statusHistory.create({
            data: {
              requestItemId: allocation.requestItemId,
              previousStatus: allocation.requestItem.status.label,
              newStatus: status.label,
              userId: req.user.sub,
              note: `Pedido ${order.number} · NF ${invoiceNumber}`,
            },
          });
          affectedRequests.push(allocation.requestItem.requestId);
          remaining = remaining.minus(applied);
        }
        if (orderItem.productId) {
          await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${orderItem.productId} FOR UPDATE`;
          const product = await tx.product.findFirstOrThrow({
            where: {
              id: orderItem.productId,
              organizationId: req.user.organizationId,
              active: true,
            },
          });
          const balance = product.stockBalance.plus(received.quantity);
          await tx.stockMovement.create({
            data: {
              productId: product.id,
              previousBalance: product.stockBalance,
              newBalance: balance,
              origin: "ENTREGA",
              userId: req.user.sub,
              actorName: req.user.name,
              note: input.note || `Recebimento do pedido ${order.number}`,
              reference: `Pedido ${order.number} · NF ${invoiceNumber}`,
              deliveryItemId: deliveryItem.id,
            },
          });
          await tx.product.update({
            where: { id: product.id },
            data: { stockBalance: balance, stockVersion: { increment: 1 } },
          });
        }
      }
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: partial ? "PARCIAL" : "RECEBIDA",
          version: { increment: 1 },
        },
      });
      await this.refreshRequests(tx, req.user.organizationId, affectedRequests);
      await tx.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          userId: req.user.sub,
          action: "PURCHASE_RECEIPT_CREATE",
          entity: "Delivery",
          entityId: delivery.id,
          after: { ...delivery, orderNumber: order.number, items: input.items },
          changedFields: ["invoiceNumber", "items", "stockBalance"],
          correlationId: String(
            req.headers["x-correlation-id"] || randomUUID(),
          ),
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
      return delivery;
    });
  }
}
