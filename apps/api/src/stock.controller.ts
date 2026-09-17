import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { AuthGuard } from "./auth.js";
import { PrismaService } from "./prisma.service.js";
import { quantity } from "./stock.validation.js";

type StockRequest = Request & { user: { sub: string; organizationId: string; role: string; name: string } };
const writers = ["ADMIN", "COMPRAS", "ALMOXARIFADO"];
function allowed(req: StockRequest) {
  if (!writers.includes(req.user.role)) throw new ForbiddenException("Seu perfil permite apenas consultar o estoque.");
}
function optionalText(value: unknown, max: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw new BadRequestException(`Texto inválido (máximo ${max} caracteres).`);
  return value.trim() || null;
}

@Controller("stock")
@UseGuards(AuthGuard)
export class StockController {
  constructor(private db: PrismaService) {}

  @Get()
  async list(@Req() req: StockRequest, @Query("q") q = "", @Query("status") status = "", @Query("page") rawPage = "1") {
    const page = Math.max(1, Math.floor(Number(rawPage) || 1));
    const base = { organizationId: req.user.organizationId, active: true };
    const low: Prisma.ProductWhereInput = { stockBalance: { gt: 0, lte: this.db.product.fields.minimumStock } };
    const where: Prisma.ProductWhereInput = { ...base,
      ...(q.trim() ? { OR: [{ code: { contains: q.trim(), mode: "insensitive" } }, { genericDescription: { contains: q.trim(), mode: "insensitive" } }] } : {}),
      ...(status === "zero" ? { stockBalance: { lte: 0 } } : status === "low" ? low : status === "attention" ? { AND: [{ OR: [{ stockBalance: { lte: 0 } }, low] }] } : {})
    };
    const [data, total, all, zero, below] = await this.db.$transaction([
      this.db.product.findMany({ where, orderBy: [{ genericDescription: "asc" }, { id: "asc" }], skip: (page - 1) * 25, take: 25,
        include: { _count: { select: { movements: true } } } }),
      this.db.product.count({ where }), this.db.product.count({ where: base }),
      this.db.product.count({ where: { ...base, stockBalance: { lte: 0 } } }),
      this.db.product.count({ where: { ...base, ...low } })
    ]);
    return { data, total, page, pageSize: 25, summary: { all, zero, below } };
  }

  @Get("movements")
  async history(@Req() req: StockRequest, @Query("productId") productId = "", @Query("page") rawPage = "1", @Query("from") from = "", @Query("to") to = "", @Query("origin") origin = "") {
    const page = Math.max(1, Math.floor(Number(rawPage) || 1));
    const date = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))) throw new BadRequestException("Data inválida.");
      return new Date(`${value}T00:00:00-03:00`);
    };
    const start = from ? date(from) : undefined;
    const end = to ? new Date(date(to).getTime() + 86400000) : undefined;
    if (start && end && start >= end) throw new BadRequestException("O período final deve ser posterior ao inicial.");
    if (origin && !["ENTRADA", "SAIDA", "INICIAL", "AJUSTE", "IMPORTACAO", "ENTREGA"].includes(origin)) throw new BadRequestException("Tipo inválido.");
    const where: Prisma.StockMovementWhereInput = { product: { organizationId: req.user.organizationId }, ...(productId ? { productId } : {}),
      ...(origin ? { origin: origin as "ENTRADA" } : {}), ...(start || end ? { createdAt: { gte: start, lt: end } } : {}) };
    const [data, total] = await this.db.$transaction([
      this.db.stockMovement.findMany({ where, include: { product: { select: { code: true, genericDescription: true, unit: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 25, take: 25 }),
      this.db.stockMovement.count({ where })
    ]);
    return { data, total, page, pageSize: 25 };
  }

  @Patch(":id/minimum")
  async minimum(@Req() req: StockRequest, @Param("id") id: string, @Body() body: { minimumStock?: unknown }) {
    allowed(req);
    const minimumStock = body.minimumStock === null ? null : quantity(body.minimumStock);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${id} AND "organizationId" = ${req.user.organizationId} FOR UPDATE`;
      const before = await tx.product.findFirst({ where: { id, organizationId: req.user.organizationId, active: true } });
      if (!before) throw new NotFoundException("Produto não encontrado.");
      const after = await tx.product.update({ where: { id }, data: { minimumStock } });
      await tx.auditLog.create({ data: { organizationId: req.user.organizationId, userId: req.user.sub, action: "STOCK_MINIMUM", entity: "Product", entityId: id,
        before: { minimumStock: before.minimumStock?.toString() ?? null }, after: { minimumStock }, changedFields: ["minimumStock"], correlationId: randomUUID() } });
      return after;
    });
  }

  @Post(":id/movements")
  async move(@Req() req: StockRequest, @Param("id") id: string, @Body() body: { type?: string; quantity?: unknown; note?: unknown; reference?: unknown; operationId?: string; version?: number }) {
    allowed(req);
    if (!["ENTRADA", "SAIDA", "INICIAL", "AJUSTE"].includes(body.type || "")) throw new BadRequestException("Tipo de movimentação inválido.");
    const type = body.type as "ENTRADA" | "SAIDA" | "INICIAL" | "AJUSTE";
    const amount = new Prisma.Decimal(quantity(body.quantity));
    if (["ENTRADA", "SAIDA"].includes(type) && amount.lte(0)) throw new BadRequestException("A quantidade deve ser maior que zero.");
    const note = optionalText(body.note, 1000);
    const reference = optionalText(body.reference, 120);
    if (type === "AJUSTE" && (!note || note.length < 5)) throw new BadRequestException("Informe o motivo do ajuste (ao menos 5 caracteres).");
    if (typeof body.operationId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.operationId)) throw new BadRequestException("Identificador da operação inválido.");
    if (!Number.isInteger(body.version) || body.version! < 0) throw new BadRequestException("Atualize o saldo antes de movimentar.");
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${id} AND "organizationId" = ${req.user.organizationId} FOR UPDATE`;
      const product = await tx.product.findFirst({ where: { id, organizationId: req.user.organizationId, active: true } });
      if (!product) throw new NotFoundException("Produto não encontrado.");
      const existing = await tx.stockMovement.findUnique({ where: { operationId: body.operationId } });
      if (existing) {
        const originalAmount = ["AJUSTE", "INICIAL"].includes(existing.origin) ? existing.newBalance : existing.newBalance.minus(existing.previousBalance).abs();
        if (existing.productId !== id || existing.userId !== req.user.sub || existing.origin !== type || !originalAmount.eq(amount) || existing.note !== note || existing.reference !== reference) throw new ConflictException("Identificador já utilizado por outra operação.");
        return existing;
      }
      if (product.stockVersion !== body.version) throw new ConflictException("O saldo mudou. Feche o formulário e confira o saldo atualizado antes de tentar novamente.");
      if (type === "INICIAL" && (await tx.stockMovement.count({ where: { productId: id } }) > 0 || !product.stockBalance.eq(0))) throw new ConflictException("Este produto já tem histórico. Use ajuste para registrar uma contagem.");
      const balance = type === "ENTRADA" ? product.stockBalance.plus(amount) : type === "SAIDA" ? product.stockBalance.minus(amount) : amount;
      if (balance.lt(0)) throw new BadRequestException("Saldo insuficiente. A saída não pode deixar o estoque negativo.");
      if (balance.gt("999999999999.999")) throw new BadRequestException("Saldo acima do limite permitido.");
      if (type === "AJUSTE" && balance.eq(product.stockBalance)) throw new BadRequestException("O saldo informado já corresponde ao saldo atual.");
      const movement = await tx.stockMovement.create({ data: { productId: id, previousBalance: product.stockBalance, newBalance: balance, origin: type,
        userId: req.user.sub, actorName: req.user.name, note, reference, operationId: body.operationId } });
      await tx.product.update({ where: { id }, data: { stockBalance: balance, stockVersion: { increment: 1 } } });
      await tx.auditLog.create({ data: { organizationId: req.user.organizationId, userId: req.user.sub, action: `STOCK_${type}`, entity: "StockMovement", entityId: movement.id,
        before: { stockBalance: product.stockBalance.toString() }, after: { stockBalance: balance.toString(), quantity: amount.toString(), note, reference },
        changedFields: ["stockBalance"], correlationId: body.operationId!, ipAddress: req.ip, userAgent: req.headers["user-agent"] } });
      return movement;
    });
  }
}
