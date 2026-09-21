import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { supplierSchema } from "@compras/shared";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { AuthGuard } from "./auth.js";
import { PrismaService } from "./prisma.service.js";

type AuthedRequest = Request & {
  user: { sub: string; organizationId: string; role: string };
};

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

@Controller("suppliers")
@UseGuards(AuthGuard)
export class SuppliersController {
  constructor(private readonly db: PrismaService) {}

  private requireReader(req: AuthedRequest) {
    if (!["ADMIN", "COMPRAS"].includes(req.user.role)) {
      throw new ForbiddenException(
        "Seu perfil não permite consultar fornecedores.",
      );
    }
  }

  @Get()
  async list(@Req() req: AuthedRequest, @Query("q") q = "") {
    this.requireReader(req);
    const term = q.trim();
    return this.db.supplier.findMany({
      where: {
        organizationId: req.user.organizationId,
        active: true,
        ...(term
          ? {
              OR: [
                { legalName: { contains: term, mode: "insensitive" } },
                { tradeName: { contains: term, mode: "insensitive" } },
                { cnpj: { contains: term.replace(/\D/g, "") } },
                { city: { contains: term, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { legalName: "asc" },
      take: 300,
    });
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() raw: unknown) {
    if (!["ADMIN", "COMPRAS"].includes(req.user.role)) {
      throw new ForbiddenException(
        "Apenas Compras ou Administração podem cadastrar fornecedores.",
      );
    }
    const parsed = supplierSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => issue.message),
      );
    }
    const input = parsed.data;
    const cnpj = input.cnpj.replace(/\D/g, "");
    const normalizedName = normalizeName(input.legalName);
    const duplicate = await this.db.supplier.findFirst({
      where: {
        organizationId: req.user.organizationId,
        OR: [{ normalizedName }, { cnpj }],
      },
    });
    if (duplicate) {
      throw new ConflictException(
        duplicate.cnpj === cnpj
          ? "Já existe um fornecedor com este CNPJ."
          : "Já existe um fornecedor com esta razão social.",
      );
    }
    return this.db.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({
        data: {
          organizationId: req.user.organizationId,
          legalName: input.legalName,
          tradeName: input.tradeName,
          normalizedName,
          cnpj,
          stateRegistration: input.stateRegistration,
          municipalRegistration: input.municipalRegistration,
          contact: input.contact,
          phone: input.phone,
          email: input.email.toLowerCase(),
          postalCode: input.postalCode.replace(/\D/g, ""),
          street: input.street,
          addressNumber: input.addressNumber,
          complement: input.complement,
          district: input.district,
          city: input.city,
          state: input.state.toUpperCase(),
          country: input.country,
          website: input.website,
          paymentTerms: input.paymentTerms,
          note: input.note,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          userId: req.user.sub,
          action: "CREATE",
          entity: "Supplier",
          entityId: supplier.id,
          after: supplier,
          changedFields: Object.keys(input),
          correlationId: String(
            req.headers["x-correlation-id"] || randomUUID(),
          ),
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
      return supplier;
    });
  }
}
