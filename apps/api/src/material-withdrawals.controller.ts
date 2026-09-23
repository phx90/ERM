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
import {
  materialWithdrawalCancelSchema,
  materialWithdrawalSchema,
} from "@compras/shared";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { AuthGuard } from "./auth.js";
import { PrismaService } from "./prisma.service.js";

type AuthedRequest = Request & {
  user: {
    sub: string;
    organizationId: string;
    role: string;
    name: string;
  };
};

const requestRoles = ["ADMIN", "COMPRAS", "SOLICITANTE", "ALMOXARIFADO"];
const warehouseRoles = ["ADMIN", "ALMOXARIFADO"];

@Controller("material-withdrawals")
@UseGuards(AuthGuard)
export class MaterialWithdrawalsController {
  constructor(private readonly db: PrismaService) {}

  private requireRole(req: AuthedRequest, roles: string[]) {
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenException(
        "Seu perfil não permite realizar esta operação.",
      );
    }
  }

  private async expirePending(organizationId: string) {
    await this.db.materialWithdrawal.updateMany({
      where: {
        organizationId,
        status: "PENDENTE",
        expiresAt: { lte: new Date() },
      },
      data: { status: "EXPIRADA" },
    });
  }

  @Get("catalog")
  async catalog(@Req() req: AuthedRequest, @Query("q") q = "") {
    this.requireRole(req, requestRoles);
    const now = new Date();
    const products = await this.db.product.findMany({
      where: {
        organizationId: req.user.organizationId,
        active: true,
        ...(q.trim()
          ? {
              OR: [
                { code: { contains: q.trim(), mode: "insensitive" } },
                {
                  genericDescription: {
                    contains: q.trim(),
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        withdrawalItems: {
          where: {
            withdrawal: { status: "PENDENTE", expiresAt: { gt: now } },
          },
          select: { quantity: true },
        },
      },
      orderBy: { genericDescription: "asc" },
      take: 300,
    });
    return products.map(({ withdrawalItems, ...product }) => {
      const reservedQuantity = withdrawalItems.reduce(
        (sum, item) => sum.plus(item.quantity),
        new Prisma.Decimal(0),
      );
      return {
        ...product,
        reservedQuantity,
        availableQuantity: Prisma.Decimal.max(
          product.stockBalance.minus(reservedQuantity),
          0,
        ),
      };
    });
  }

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query("status") status = "",
    @Query("q") q = "",
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "20",
  ) {
    await this.expirePending(req.user.organizationId);
    const warehouse = warehouseRoles.includes(req.user.role);
    const currentPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const size = Math.min(50, Math.max(5, Number.parseInt(pageSize, 10) || 20));
    const where: Prisma.MaterialWithdrawalWhereInput = {
      organizationId: req.user.organizationId,
      ...(!warehouse ? { requestedById: req.user.sub } : {}),
      ...(status &&
      ["PENDENTE", "RETIRADA", "CANCELADA", "EXPIRADA"].includes(status)
        ? {
            status: status as
              "PENDENTE" | "RETIRADA" | "CANCELADA" | "EXPIRADA",
          }
        : {}),
      ...(q.trim()
        ? {
            OR: [
              { number: { contains: q.trim(), mode: "insensitive" } },
              { purpose: { contains: q.trim(), mode: "insensitive" } },
              { workSite: { contains: q.trim(), mode: "insensitive" } },
              {
                items: {
                  some: {
                    product: {
                      genericDescription: {
                        contains: q.trim(),
                        mode: "insensitive",
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.materialWithdrawal.findMany({
        where,
        include: {
          requestedBy: { select: { name: true } },
          processedBy: { select: { name: true } },
          items: { include: { product: true } },
        },
        orderBy: { requestedAt: "desc" },
        skip: (currentPage - 1) * size,
        take: size,
      }),
      this.db.materialWithdrawal.count({ where }),
    ]);
    return { data, total, page: currentPage, pageSize: size };
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() raw: unknown) {
    this.requireRole(req, requestRoles);
    const parsed = materialWithdrawalSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => issue.message),
      );
    }
    const input = parsed.data;
    const now = new Date();
    if (input.expiresAt <= now) {
      throw new BadRequestException(
        "O prazo para retirada deve ser posterior ao horário atual.",
      );
    }
    if (input.expiresAt.getTime() > now.getTime() + 30 * 86_400_000) {
      throw new BadRequestException(
        "A reserva pode permanecer ativa por no máximo 30 dias.",
      );
    }
    if (
      new Set(input.items.map((item) => item.productId)).size !==
      input.items.length
    ) {
      throw new BadRequestException(
        "Cada material deve aparecer apenas uma vez.",
      );
    }
    return this.db.$transaction(async (tx) => {
      const productIds = input.items.map((item) => item.productId).sort();
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id IN (${Prisma.join(productIds)}) FOR UPDATE`;
      const products = await tx.product.findMany({
        where: {
          id: { in: productIds },
          organizationId: req.user.organizationId,
          active: true,
        },
        include: {
          withdrawalItems: {
            where: {
              withdrawal: { status: "PENDENTE", expiresAt: { gt: now } },
            },
            select: { quantity: true },
          },
        },
      });
      if (products.length !== productIds.length) {
        throw new BadRequestException(
          "Um ou mais materiais não foram encontrados.",
        );
      }
      const byId = new Map(products.map((product) => [product.id, product]));
      for (const item of input.items) {
        const product = byId.get(item.productId)!;
        const reserved = product.withdrawalItems.reduce(
          (sum, current) => sum.plus(current.quantity),
          new Prisma.Decimal(0),
        );
        const available = product.stockBalance.minus(reserved);
        if (new Prisma.Decimal(item.quantity).gt(available)) {
          throw new ConflictException(
            `Saldo disponível insuficiente para ${product.genericDescription}. Disponível: ${available.toString()} ${product.unit || "UN"}.`,
          );
        }
      }
      const id = randomUUID();
      const number = `RET-${now.getFullYear()}-${id.slice(0, 8).toUpperCase()}`;
      const withdrawal = await tx.materialWithdrawal.create({
        data: {
          id,
          organizationId: req.user.organizationId,
          number,
          requestedById: req.user.sub,
          purpose: input.purpose,
          destination: input.destination,
          workSite: input.workSite,
          expiresAt: input.expiresAt,
          items: {
            create: input.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
        },
        include: {
          requestedBy: { select: { name: true } },
          items: { include: { product: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          userId: req.user.sub,
          action: "MATERIAL_RESERVE",
          entity: "MaterialWithdrawal",
          entityId: withdrawal.id,
          requestNumber: withdrawal.number,
          after: withdrawal,
          changedFields: [
            "purpose",
            "destination",
            "workSite",
            "status",
            "expiresAt",
            "items",
          ],
          correlationId: String(
            req.headers["x-correlation-id"] || randomUUID(),
          ),
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
      return withdrawal;
    });
  }

  @Post(":id/complete")
  async complete(@Req() req: AuthedRequest, @Param("id") id: string) {
    this.requireRole(req, warehouseRoles);
    await this.expirePending(req.user.organizationId);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "MaterialWithdrawal" WHERE id = ${id} FOR UPDATE`;
      const withdrawal = await tx.materialWithdrawal.findFirst({
        where: { id, organizationId: req.user.organizationId },
        include: { items: { include: { product: true } } },
      });
      if (!withdrawal) throw new NotFoundException("Retirada não encontrada.");
      if (withdrawal.status !== "PENDENTE") {
        throw new ConflictException(
          "Esta retirada não está mais pendente para baixa.",
        );
      }
      const productIds = withdrawal.items.map((item) => item.productId).sort();
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id IN (${Prisma.join(productIds)}) FOR UPDATE`;
      for (const item of withdrawal.items) {
        const product = await tx.product.findFirstOrThrow({
          where: {
            id: item.productId,
            organizationId: req.user.organizationId,
            active: true,
          },
        });
        const nextBalance = product.stockBalance.minus(item.quantity);
        if (nextBalance.lt(0)) {
          throw new ConflictException(
            `O saldo físico de ${product.genericDescription} não é suficiente para a baixa.`,
          );
        }
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            previousBalance: product.stockBalance,
            newBalance: nextBalance,
            origin: "SAIDA",
            userId: req.user.sub,
            actorName: req.user.name,
            note: withdrawal.purpose,
            reference: withdrawal.number,
            operationId: item.id,
            withdrawalItemId: item.id,
          },
        });
        await tx.product.update({
          where: { id: product.id },
          data: {
            stockBalance: nextBalance,
            stockVersion: { increment: 1 },
          },
        });
      }
      const completed = await tx.materialWithdrawal.update({
        where: { id },
        data: {
          status: "RETIRADA",
          processedAt: new Date(),
          processedById: req.user.sub,
        },
        include: {
          requestedBy: { select: { name: true } },
          processedBy: { select: { name: true } },
          items: { include: { product: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          userId: req.user.sub,
          action: "MATERIAL_WITHDRAWAL_COMPLETE",
          entity: "MaterialWithdrawal",
          entityId: id,
          requestNumber: withdrawal.number,
          before: withdrawal,
          after: completed,
          changedFields: ["status", "processedAt", "stockBalance"],
          correlationId: String(
            req.headers["x-correlation-id"] || randomUUID(),
          ),
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
      return completed;
    });
  }

  @Post(":id/cancel")
  async cancel(
    @Req() req: AuthedRequest,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const parsed = materialWithdrawalCancelSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException("Informe o motivo do cancelamento.");
    }
    await this.expirePending(req.user.organizationId);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "MaterialWithdrawal" WHERE id = ${id} FOR UPDATE`;
      const withdrawal = await tx.materialWithdrawal.findFirst({
        where: { id, organizationId: req.user.organizationId },
      });
      if (!withdrawal) throw new NotFoundException("Retirada não encontrada.");
      if (
        withdrawal.requestedById !== req.user.sub &&
        !warehouseRoles.includes(req.user.role)
      ) {
        throw new ForbiddenException(
          "Você não pode cancelar esta solicitação.",
        );
      }
      if (withdrawal.status !== "PENDENTE") {
        throw new ConflictException(
          "Somente reservas pendentes podem ser canceladas.",
        );
      }
      const canceled = await tx.materialWithdrawal.update({
        where: { id },
        data: {
          status: "CANCELADA",
          canceledAt: new Date(),
          cancelReason: parsed.data.reason,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          userId: req.user.sub,
          action: "MATERIAL_RESERVATION_CANCEL",
          entity: "MaterialWithdrawal",
          entityId: id,
          requestNumber: withdrawal.number,
          before: withdrawal,
          after: canceled,
          changedFields: ["status", "cancelReason"],
          correlationId: String(
            req.headers["x-correlation-id"] || randomUUID(),
          ),
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
      return canceled;
    });
  }
}
