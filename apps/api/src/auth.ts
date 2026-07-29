import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

export const ROLES_KEY = "roles";
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { user?: Record<string, string> }>();
    const token = request.cookies?.access_token as string | undefined;
    if (!token) throw new UnauthorizedException();
    try { request.user = this.jwt.verify<Record<string, string>>(token); return true; }
    catch { throw new UnauthorizedException(); }
  }
}
