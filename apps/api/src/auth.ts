import { PrismaService } from "./prisma.service.js";
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

export const ROLES_KEY = "roles";
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly db: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: Record<string, string> }>();
    const token = request.cookies?.access_token as string | undefined;
    if (!token) throw new UnauthorizedException();
    try {
      const payload = this.jwt.verify<Record<string, string>>(token);
      const session = await this.db.session.findFirst({
        where: {
          id: payload.sid,
          userId: payload.sub,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { active: true, deletedAt: null },
        },
        include: { user: true },
      });
      if (!session) throw new UnauthorizedException();
      request.user = {
        ...payload,
        sub: session.user.id,
        organizationId: session.user.organizationId,
        role: session.user.role,
        name: session.user.name,
      };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
