import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Role } from "@prisma/client";
import { hash } from "argon2";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { MIN_PASSWORD_LENGTH } from "@compras/shared";
import { AuthGuard } from "./auth.js";
import { PrismaService } from "./prisma.service.js";

type AuthedRequest = Request & {
  user: { sub: string; organizationId: string; role: string };
};

const roles = [
  "ADMIN",
  "COMPRAS",
  "ALMOXARIFADO",
  "SOLICITANTE",
  "CONSULTA",
] as const;

function parseCreate(raw: unknown) {
  const body = (raw || {}) as Record<string, unknown>;
  const name = String(body.name || "").trim();
  const login = String(body.login || "")
    .trim()
    .toLowerCase();
  const password = String(body.password || "");
  const jobTitle = String(body.jobTitle || "").trim() || undefined;
  const role = String(body.role || "") as (typeof roles)[number];
  if (name.length < 2 || name.length > 120)
    throw new BadRequestException("Informe um nome com 2 a 120 caracteres.");
  if (!/^[a-z0-9._-]{3,50}$/.test(login))
    throw new BadRequestException(
      "O login deve ter 3 a 50 caracteres e usar apenas letras, números, ponto, hífen ou sublinhado.",
    );
  if (!roles.includes(role))
    throw new BadRequestException("Selecione um perfil válido.");
  if (password.length < MIN_PASSWORD_LENGTH)
    throw new BadRequestException(
      `A senha temporária deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    );
  if (jobTitle && jobTitle.length > 100)
    throw new BadRequestException("O cargo deve ter no máximo 100 caracteres.");
  return { name, login, password, jobTitle, role };
}

@Controller("users")
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly db: PrismaService) {}

  private requireAdmin(req: AuthedRequest) {
    if (req.user.role !== "ADMIN")
      throw new ForbiddenException(
        "Apenas administradores podem gerenciar usuários.",
      );
  }

  private auditContext(req: AuthedRequest) {
    return {
      organizationId: req.user.organizationId,
      userId: req.user.sub,
      correlationId: String(req.headers["x-correlation-id"] || randomUUID()),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    };
  }

  @Get()
  async list(@Req() req: AuthedRequest, @Query("q") q = "") {
    this.requireAdmin(req);
    const term = q.trim();
    return this.db.user.findMany({
      where: {
        organizationId: req.user.organizationId,
        deletedAt: null,
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: "insensitive" } },
                { login: { contains: term, mode: "insensitive" } },
                { jobTitle: { contains: term, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        login: true,
        role: true,
        jobTitle: true,
        active: true,
        mustChangePassword: true,
        lastAccessAt: true,
        createdAt: true,
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() raw: unknown) {
    this.requireAdmin(req);
    const input = parseCreate(raw);
    const duplicate = await this.db.user.findFirst({
      where: {
        organizationId: req.user.organizationId,
        login: input.login,
      },
    });
    if (duplicate) throw new ConflictException("Este login já está em uso.");
    return this.db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          organizationId: req.user.organizationId,
          name: input.name,
          login: input.login,
          passwordHash: await hash(input.password),
          jobTitle: input.jobTitle,
          role: input.role as Role,
          mustChangePassword: true,
        },
        select: {
          id: true,
          name: true,
          login: true,
          role: true,
          jobTitle: true,
          active: true,
          mustChangePassword: true,
          lastAccessAt: true,
          createdAt: true,
        },
      });
      await tx.auditLog.create({
        data: {
          ...this.auditContext(req),
          action: "CREATE",
          entity: "User",
          entityId: user.id,
          after: user,
          changedFields: ["name", "login", "role", "jobTitle", "active"],
        },
      });
      return user;
    });
  }

  @Patch(":id/status")
  async updateStatus(
    @Req() req: AuthedRequest,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    this.requireAdmin(req);
    const active = (raw as { active?: unknown })?.active;
    if (typeof active !== "boolean")
      throw new BadRequestException("Informe o status do usuário.");
    if (id === req.user.sub && !active)
      throw new BadRequestException(
        "Você não pode desativar sua própria conta.",
      );
    const current = await this.db.user.findFirst({
      where: { id, organizationId: req.user.organizationId, deletedAt: null },
      select: { id: true, name: true, login: true, role: true, active: true },
    });
    if (!current) throw new NotFoundException("Usuário não encontrado.");
    return this.db.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          active,
          failedLoginAttempts: active ? 0 : undefined,
          lockedUntil: null,
        },
        select: {
          id: true,
          name: true,
          login: true,
          role: true,
          jobTitle: true,
          active: true,
          mustChangePassword: true,
          lastAccessAt: true,
          createdAt: true,
        },
      });
      if (!active)
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await tx.auditLog.create({
        data: {
          ...this.auditContext(req),
          action: active ? "ACTIVATE" : "DEACTIVATE",
          entity: "User",
          entityId: id,
          before: current,
          after: user,
          changedFields: ["active"],
        },
      });
      return user;
    });
  }

  @Post(":id/reset-password")
  async resetPassword(
    @Req() req: AuthedRequest,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    this.requireAdmin(req);
    const password = String((raw as { password?: unknown })?.password || "");
    if (password.length < MIN_PASSWORD_LENGTH)
      throw new BadRequestException(
        `A senha temporária deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      );
    const current = await this.db.user.findFirst({
      where: { id, organizationId: req.user.organizationId, deletedAt: null },
      select: { id: true, login: true },
    });
    if (!current) throw new NotFoundException("Usuário não encontrado.");
    await this.db.$transaction([
      this.db.user.update({
        where: { id },
        data: {
          passwordHash: await hash(password),
          mustChangePassword: true,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      this.db.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.db.auditLog.create({
        data: {
          ...this.auditContext(req),
          action: "RESET_PASSWORD",
          entity: "User",
          entityId: id,
          changedFields: ["passwordHash", "mustChangePassword"],
        },
      }),
    ]);
    return { ok: true };
  }
}
