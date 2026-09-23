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
  async demand(
    @Req() req: Authed,
    @Query("q") q = "",
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "20",
  ) {
    const currentPage = Math.max(Number(page) || 1, 1);
    const take = Math.min(Math.max(Number(pageSize) || 20, 5), 50);
    const skip = (currentPage - 1) * take;
    const term = q.trim();
    const pattern = `%${term}%`;
    const searchClause = term
      ? Prisma.sql`AND (
          pr."number" ILIKE ${pattern}
          OR COALESCE(pr."requesterOriginal", '') ILIKE ${pattern}
          OR creator."name" ILIKE ${pattern}
          OR EXISTS (
            SELECT 1 FROM "PurchaseRequestItem" search_item
            WHERE search_item."requestId" = pr."id"
              AND search_item."deletedAt" IS NULL
              AND (
                search_item."description" ILIKE ${pattern}
                OR COALESCE(search_item."manualCode", '') ILIKE ${pattern}
              )
          )
        )`
      : Prisma.empty;
    const openDemand = Prisma.sql`
      FROM "PurchaseRequest" pr
      JOIN "User" creator ON creator."id" = pr."createdById"
      WHERE pr."organizationId" = ${req.user.organizationId}
        AND pr."deletedAt" IS NULL
        ${searchClause}
        AND EXISTS (
          SELECT 1
          FROM "PurchaseRequestItem" pri
          JOIN "RequestStatus" rs ON rs."id" = pri."statusId"
          WHERE pri."requestId" = pr."id"
            AND pri."deletedAt" IS NULL
            AND rs."code" NOT IN ('CANCELADO', 'ENTREGUE')
            AND pri."requestedQuantity" > pri."purchasedQuantity"
        )
    `;
    const [requestRows, totalRows] = await Promise.all([
      this.db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT pr."id"
        ${openDemand}
        ORDER BY pr."requestDate" ASC, pr."createdAt" ASC
        LIMIT ${take} OFFSET ${skip}
      `),
      this.db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        ${openDemand}
      `),
    ]);
    const requestIds = requestRows.map((row) => row.id);
    if (!requestIds.length)
      return {
        data: [],
        total: Number(totalRows[0]?.count || 0),
        page: currentPage,
        pageSize: take,
      };
    const items = await this.db.purchaseRequestItem.findMany({
      where: {
        requestId: { in: requestIds },
        deletedAt: null,
        status: { code: { notIn: ["CANCELADO", "ENTREGUE"] } },
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
      orderBy: { createdAt: "asc" },
    });
    const requestOrder = new Map(requestIds.map((id, index) => [id, index]));
    const data = items
      .filter((item) => item.requestedQuantity.gt(item.purchasedQuantity))
      .map((item) => ({
        ...item,
        openQuantity: item.requestedQuantity.minus(item.purchasedQuantity),
      }))
      .sort(
        (left, right) =>
          (requestOrder.get(left.requestId) || 0) -
          (requestOrder.get(right.requestId) || 0),
      );
    return {
      data,
      total: Number(totalRows[0]?.count || 0),
      page: currentPage,
      pageSize: take,
    };
  }

  @Get("orders")
  async orders(
    @Req() req: Authed,
    @Query("q") q = "",
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "20",
  ) {
    const currentPage = Math.max(Number(page) || 1, 1);
    const take = Math.min(Math.max(Number(pageSize) || 20, 5), 50);
    const where = {
      organizationId: req.user.organizationId,
      deletedAt: null,
      ...(q.trim()
        ? {
            OR: [
              { number: { contains: q.trim(), mode: "insensitive" as const } },
              {
                supplier: {
                  legalName: {
                    contains: q.trim(),
                    mode: "insensitive" as const,
                  },
                },
              },
              {
                deliveries: {
                  some: {
                    invoiceNumber: {
                      contains: q.trim(),
                      mode: "insensitive" as const,
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [orders, total] = await this.db.$transaction([
      this.db.purchaseOrder.findMany({
        where,
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
        skip: (currentPage - 1) * take,
        take,
      }),
      this.db.purchaseOrder.count({ where }),
    ]);
    const users = await this.usersById(
      req.user.organizationId,
      orders.flatMap((order) => [
        order.buyerId,
        ...order.deliveries.map((delivery) => delivery.receivedById),
      ]),
    );
    const data = orders.map((order) => ({
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
    return { data, total, page: currentPage, pageSize: take };
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
