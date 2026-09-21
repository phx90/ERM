import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { productRegistrationRequestSchema } from "@compras/shared";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { AuthGuard } from "./auth.js";
import { PrismaService } from "./prisma.service.js";

type AuthedRequest = Request & {
  user: { sub: string; organizationId: string; role: string };
};

@Controller("product-registration-requests")
@UseGuards(AuthGuard)
export class ProductRegistrationRequestsController {
  constructor(private readonly db: PrismaService) {}

  private authorize(req: AuthedRequest) {
    if (!["ADMIN", "ALMOXARIFADO"].includes(req.user.role)) {
      throw new ForbiddenException(
        "Apenas o almoxarifado pode solicitar o cadastro de itens.",
      );
    }
  }

  @Get()
  async list(@Req() req: AuthedRequest) {
    this.authorize(req);
    return this.db.productRegistrationRequest.findMany({
      where: { organizationId: req.user.organizationId },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() raw: unknown) {
    this.authorize(req);
    const parsed = productRegistrationRequestSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(
        "Preencha descrição, unidade, referências e ao menos um link válido.",
      );
    }
    const input = parsed.data;
    return this.db.$transaction(async (tx) => {
      const registrationRequest = await tx.productRegistrationRequest.create({
        data: {
          organizationId: req.user.organizationId,
          createdById: req.user.sub,
          description: input.description,
          unit: input.unit.toUpperCase(),
          references: input.references,
          referenceLinks: input.referenceLinks,
        },
        include: { createdBy: { select: { name: true } } },
      });
      await tx.auditLog.create({
        data: {
          organizationId: req.user.organizationId,
          userId: req.user.sub,
          action: "CREATE",
          entity: "ProductRegistrationRequest",
          entityId: registrationRequest.id,
          after: registrationRequest,
          changedFields: [
            "description",
            "unit",
            "references",
            "referenceLinks",
          ],
          correlationId: String(
            req.headers["x-correlation-id"] || randomUUID(),
          ),
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
      return registrationRequest;
    });
  }
}
