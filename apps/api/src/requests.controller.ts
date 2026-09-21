import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "./auth.js";
import { PrismaService } from "./prisma.service.js";
import { purchaseRequestSchema } from "@compras/shared";
import { randomUUID } from "node:crypto";

type Authed = Request & {
  user: { sub: string; organizationId: string; role: string };
};

@Controller("requests")
@UseGuards(AuthGuard)
export class RequestsController {
  constructor(private db: PrismaService) {}

  @Get()
  async list(
    @Req() req: Authed,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "25",
    @Query("q") q = "",
    @Query("status") status = "",
    @Query("criticality") criticality = "",
    @Query("sortDir") sortDir = "desc",
  ) {
    const take = Math.min(Math.max(Number(pageSize) || 25, 10), 100);
    const where = {
      organizationId: req.user.organizationId,
      deletedAt: null,
      ...(status ? { aggregateStatus: status } : {}),
      ...(criticality
        ? {
            items: {
              some: { criticality: criticality as "BAIXA" | "MEDIA" | "ALTA" },
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" as const } },
              {
                items: {
                  some: {
                    description: { contains: q, mode: "insensitive" as const },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.purchaseRequest.findMany({
        where,
        include: { items: { include: { status: true } }, department: true },
        orderBy: { requestDate: sortDir === "asc" ? "asc" : "desc" },
        skip: (Number(page) - 1) * take,
        take,
      }),
      this.db.purchaseRequest.count({ where }),
    ]);
    return { data, total, page: Number(page), pageSize: take };
  }

  @Get(":id")
  async detail(@Req() req: Authed, @Param("id") id: string) {
    return this.db.purchaseRequest.findFirstOrThrow({
      where: { id, organizationId: req.user.organizationId, deletedAt: null },
      include: {
        department: true,
        project: true,
        createdBy: { select: { name: true } },
        updatedBy: { select: { name: true } },
        items: {
          where: { deletedAt: null },
          include: {
            product: true,
            status: true,
            allocations: {
              include: {
                orderItem: {
                  include: { order: { include: { supplier: true } } },
                },
              },
            },
            statusHistory: { orderBy: { createdAt: "desc" } },
          },
        },
      },
    });
  }

  @Get("catalog/statuses")
  async statuses(@Req() req: Authed) {
    return this.db.requestStatus.findMany({
      where: { organizationId: req.user.organizationId, active: true },
      orderBy: { label: "asc" },
      select: {
        id: true,
        code: true,
        label: true,
        color: true,
        terminal: true,
      },
    });
  }

  @Patch(":requestId/items/:itemId/status")
  async updateItemStatus(
    @Req() req: Authed,
    @Param("requestId") requestId: string,
    @Param("itemId") itemId: string,
    @Body() body: { statusId: string; version: number; note?: string },
  ) {
    return this.db.$transaction(async (tx) => {
      const item = await tx.purchaseRequestItem.findFirstOrThrow({
        where: {
          id: itemId,
          requestId,
          request: { organizationId: req.user.organizationId },
          deletedAt: null,
        },
        include: { status: true, request: true },
      });
      const nextStatus = await tx.requestStatus.findFirstOrThrow({
        where: {
          id: body.statusId,
          organizationId: req.user.organizationId,
          active: true,
        },
      });
      const changed = await tx.purchaseRequestItem.updateMany({
        where: { id: itemId, version: body.version },
        data: { statusId: nextStatus.id, version: { increment: 1 } },
      });
      if (!changed.count) {
        const current = await tx.purchaseRequestItem.findUnique({
          where: { id: itemId },
          include: { status: true },
        });
        throw new ConflictException({
          message: "O item foi alterado por outro usuário.",
          current,
          attempted: body,
        });
      }
      await tx.statusHistory.create({
        data: {
          requestItemId: itemId,
          previousStatus: item.status.label,
          newStatus: nextStatus.label,
          userId: req.user.sub,
          note: body.note?.trim() || null,
        },
      });
      const requestItems = await tx.purchaseRequestItem.findMany({
        where: { requestId, deletedAt: null },
        include: { status: true },
      });
      const labels = [
        ...new Set(requestItems.map((current) => current.status.label)),
      ];
      const aggregateStatus =
        labels.length === 1
          ? labels[0]
          : requestItems.every((current) => current.status.terminal)
            ? "CONCLUÍDA"
            : "EM ANDAMENTO";
      await tx.purchaseRequest.update({
        where: { id: requestId },
        data: {
          aggregateStatus,
          updatedById: req.user.sub,
          version: { increment: 1 },
        },
      });
      const after = await tx.purchaseRequestItem.findUniqueOrThrow({
        where: { id: itemId },
        include: { status: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          userId: req.user.sub,
          action: "STATUS_CHANGE",
          entity: "PurchaseRequestItem",
          entityId: itemId,
          requestNumber: item.request.number,
          before: item,
          after,
          changedFields: ["statusId"],
          correlationId: String(
            req.headers["x-correlation-id"] || randomUUID(),
          ),
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
      return after;
    });
  }

  @Post()
  async create(@Req() req: Authed, @Body() raw: unknown) {
    if (!["ADMIN", "ALMOXARIFADO", "SOLICITANTE"].includes(req.user.role)) {
      throw new ForbiddenException(
        "Seu perfil não permite criar pedidos internos de compra.",
      );
    }
    const input = purchaseRequestSchema.parse(raw);
    return this.db.$transaction(async (tx) => {
      const status = await tx.requestStatus.findFirstOrThrow({
        where: {
          organizationId: req.user.organizationId,
          code: "AGUARDANDO_AQUISICAO",
        },
      });
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user.organizationId}))`;
      const last = await tx.purchaseRequest.findFirst({
        where: { organizationId: req.user.organizationId },
        orderBy: { createdAt: "desc" },
      });
      const number = String((Number(last?.number) || 0) + 1).padStart(6, "0");
      const created = await tx.purchaseRequest.create({
        data: {
          organizationId: req.user.organizationId,
          number,
          requestDate: input.requestDate,
          requesterId: input.requesterId,
          departmentId: input.departmentId,
          projectId: input.projectId,
          notes: input.notes,
          aggregateStatus: status.label,
          createdById: req.user.sub,
          updatedById: req.user.sub,
          items: {
            create: input.items.map((item) => ({
              ...item,
              quantity: item.quantity,
              requestedQuantity: item.quantity,
              statusId: status.id,
            })),
          },
        },
        include: { items: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          userId: req.user.sub,
          action: "CREATE",
          entity: "PurchaseRequest",
          entityId: created.id,
          requestNumber: number,
          after: created,
          changedFields: Object.keys(input),
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

  @Patch(":id")
  async update(
    @Req() req: Authed,
    @Param("id") id: string,
    @Body() body: { version: number; notes?: string },
  ) {
    return this.db.$transaction(async (tx) => {
      const before = await tx.purchaseRequest.findFirstOrThrow({
        where: { id, organizationId: req.user.organizationId, deletedAt: null },
      });
      const result = await tx.purchaseRequest.updateMany({
        where: { id, version: body.version },
        data: {
          notes: body.notes,
          updatedById: req.user.sub,
          version: { increment: 1 },
        },
      });
      if (!result.count) {
        const current = await tx.purchaseRequest.findUnique({
          where: { id },
          include: { items: true },
        });
        throw new ConflictException({
          message: "Registro alterado por outro usuário",
          current,
          attempted: body,
        });
      }
      const after = await tx.purchaseRequest.findUniqueOrThrow({
        where: { id },
      });
      await tx.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          userId: req.user.sub,
          action: "UPDATE",
          entity: "PurchaseRequest",
          entityId: id,
          requestNumber: before.number,
          before,
          after,
          changedFields: ["notes"],
          correlationId: String(
            req.headers["x-correlation-id"] || randomUUID(),
          ),
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
      return after;
    });
  }
}
