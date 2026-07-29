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
  minimumStock?: number;
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
      ...(stock === "below" ? { minimumStock: { not: null } } : {}),
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
    if (!["ADMIN", "COMPRAS"].includes(req.user.role)) throw new BadRequestException("Perfil sem permissão para editar produtos.");
    const before = await this.db.product.findFirstOrThrow({ where: { id, organizationId: req.user.organizationId, active: true } });
    const code = String(input.code || before.code).trim();
    const description = String(input.genericDescription || before.genericDescription).trim();
    const duplicate = await this.db.product.findFirst({ where: { organizationId: req.user.organizationId, code, id: { not: id } } });
    if (duplicate) throw new BadRequestException("Já existe outro produto com este código.");
    return this.db.$transaction(async tx => {
      const product = await tx.product.update({ where: { id }, data: {
        code, genericDescription: description, type: input.type?.trim() || null, unit: input.unit?.trim().toUpperCase() || "UN",
        productGroup: input.productGroup?.trim() || null, socpCode: input.socpCode?.trim() || null,
        stockBalance: input.stockBalance === undefined ? before.stockBalance : Number(input.stockBalance),
        projectCode: input.projectCode?.trim() || null, unitCost: input.unitCost === undefined ? null : Number(input.unitCost),
        note: input.note?.trim() || null, ca: input.ca?.trim() || null,
        minimumStock: input.minimumStock === undefined ? null : Number(input.minimumStock)
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
    if (!["ADMIN", "COMPRAS"].includes(req.user.role)) throw new BadRequestException("Perfil sem permissão para cadastrar produtos.");
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
        stockBalance: Number(input.stockBalance || 0),
        projectCode: input.projectCode?.trim() || null,
        unitCost: input.unitCost === undefined ? null : Number(input.unitCost),
        note: input.note?.trim() || null,
        ca: input.ca?.trim() || null,
        minimumStock: input.minimumStock === undefined ? null : Number(input.minimumStock),
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
