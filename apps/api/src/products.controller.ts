import { quantity } from "./stock.validation.js";
import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "./prisma.service.js";
import { AuthGuard } from "./auth.js";
import { randomUUID } from "node:crypto";

type AuthedRequest = Request & { user: { sub: string; organizationId: string; role: string } };
type ProductInput = {
  code: string;
  genericDescription: string;
  type?: string;
  unit?: string;
  productGroup?: string;
  socpCode?: string;
  stockBalance?: number;
  projectCode?: string;
  unitCost?: number;
  note?: string;
  ca?: string;
  minimumStock?: number | null;
};

@Controller("products")
@UseGuards(AuthGuard)
export class ProductsController {
  constructor(private db: PrismaService) {}

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query("q") q = "",
    @Query("page") page = "1",
    @Query("limit") limit = "25",
    @Query("group") group = "",
    @Query("stock") stock = "",
    @Query("sortBy") sortBy = "genericDescription",
    @Query("sortDir") sortDir = "asc"
  ) {
    const take = Math.min(Math.max(Number(limit) || 25, 1), 100);
    const currentPage = Math.max(Number(page) || 1, 1);
    const where = {
      organizationId: req.user.organizationId,
      active: true,
      ...(group ? { productGroup: group } : {}),
      ...(stock === "zero" ? { stockBalance: 0 } : {}),
      ...(stock === "below" ? { stockBalance: { lte: this.db.product.fields.minimumStock } } : {}),
      ...(q.trim() ? { OR: [
        { code: { contains: q.trim(), mode: "insensitive" as const } },
        { genericDescription: { contains: q.trim(), mode: "insensitive" as const } }
      ] } : {})
    };
    const [data, total] = await this.db.$transaction([
      this.db.product.findMany({
        where,
        orderBy: [{ [(["code", "genericDescription", "stockBalance", "unitCost"].includes(sortBy) ? sortBy : "genericDescription")]: sortDir === "desc" ? "desc" : "asc" }],
        skip: (currentPage - 1) * take,
        take
      }),
      this.db.product.count({ where })
    ]);
    return { data, total, page: currentPage, pageSize: take };
  }

  @Get(":id")
  async detail(@Req() req: AuthedRequest, @Param("id") id: string) {
    return this.db.product.findFirstOrThrow({ where: { id, organizationId: req.user.organizationId, active: true }, include: {
      requestItems: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 20, include: { request: { select: { id: true, number: true, requestDate: true, aggregateStatus: true } } } },
      movements: { orderBy: { createdAt: "desc" }, take: 20 }
    }});
  }

  @Patch(":id")
  async update(@Req() req: AuthedRequest, @Param("id") id: string, @Body() input: ProductInput) {
    if (!["ADMIN", "COMPRAS", "ALMOXARIFADO"].includes(req.user.role)) throw new BadRequestException("Perfil sem permissão para editar produtos.");
    if (input.stockBalance !== undefined) throw new BadRequestException("Altere o saldo pelo módulo de estoque.");
    if (input.minimumStock != null) quantity(input.minimumStock);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${id} AND "organizationId" = ${req.user.organizationId} FOR UPDATE`;
      const before = await tx.product.findFirstOrThrow({ where: { id, organizationId: req.user.organizationId, active: true } });
      const code = String(input.code || before.code).trim();
      const description = String(input.genericDescription || before.genericDescription).trim();
      const duplicate = await tx.product.findFirst({ where: { organizationId: req.user.organizationId, code, id: { not: id } } });
      if (duplicate) throw new BadRequestException("Já existe outro produto com este código.");
      if (input.unit !== undefined && !input.unit?.trim()) throw new BadRequestException("Informe a unidade do produto.");
      if (input.unit && input.unit.trim().toUpperCase() !== before.unit && await tx.stockMovement.count({ where: { productId: id } })) throw new BadRequestException("A unidade não pode mudar após movimentações de estoque.");
      const product = await tx.product.update({ where: { id }, data: {
        code, genericDescription: description, type: input.type === undefined ? undefined : input.type?.trim() || null, unit: input.unit === undefined ? undefined : input.unit.trim().toUpperCase(),
        productGroup: input.productGroup === undefined ? undefined : input.productGroup?.trim() || null, socpCode: input.socpCode === undefined ? undefined : input.socpCode?.trim() || null,
        projectCode: input.projectCode === undefined ? undefined : input.projectCode?.trim() || null, unitCost: input.unitCost === undefined ? undefined : input.unitCost === null ? null : Number(input.unitCost),
        note: input.note === undefined ? undefined : input.note?.trim() || null, ca: input.ca === undefined ? undefined : input.ca?.trim() || null,
        minimumStock: input.minimumStock === undefined ? undefined : input.minimumStock === null ? null : quantity(input.minimumStock)
      }});
      await tx.auditLog.create({ data: {
        organizationId: req.user.organizationId, userId: req.user.sub, action: "UPDATE", entity: "Product",
        entityId: id, before, after: product, changedFields: Object.keys(input),
        correlationId: String(req.headers["x-correlation-id"] || randomUUID()), ipAddress: req.ip, userAgent: req.headers["user-agent"]
      }});
      return product;
    });
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() input: ProductInput) {
    if (!["ADMIN", "COMPRAS", "ALMOXARIFADO"].includes(req.user.role)) throw new BadRequestException("Perfil sem permissão para cadastrar produtos.");
    if (input.stockBalance !== undefined && input.stockBalance !== 0) throw new BadRequestException("Registre o saldo inicial pelo módulo de estoque.");
    if (input.minimumStock != null) quantity(input.minimumStock);
    const code = String(input.code || "").trim();
    const description = String(input.genericDescription || "").trim();
    if (!code || !description) throw new BadRequestException("Código e descrição são obrigatórios.");
    const existing = await this.db.product.findUnique({ where: { organizationId_code: { organizationId: req.user.organizationId, code } } });
    if (existing) throw new BadRequestException("Já existe um produto com este código.");
    return this.db.$transaction(async tx => {
      const product = await tx.product.create({ data: {
        organizationId: req.user.organizationId,
        code,
        genericDescription: description,
        type: input.type?.trim() || null,
        unit: input.unit?.trim().toUpperCase() || "UN",
        productGroup: input.productGroup?.trim() || null,
        socpCode: input.socpCode?.trim() || null,
        stockBalance: 0,
        projectCode: input.projectCode?.trim() || null,
        unitCost: input.unitCost === undefined ? null : Number(input.unitCost),
        note: input.note?.trim() || null,
        ca: input.ca?.trim() || null,
        minimumStock: input.minimumStock == null ? null : quantity(input.minimumStock),
        lastSyncedAt: new Date()
      }});
      await tx.auditLog.create({ data: {
        organizationId: req.user.organizationId, userId: req.user.sub, action: "CREATE", entity: "Product",
        entityId: product.id, after: product, changedFields: Object.keys(input),
        correlationId: String(req.headers["x-correlation-id"] || randomUUID()), ipAddress: req.ip, userAgent: req.headers["user-agent"]
      }});
      return product;
    });
  }
}
