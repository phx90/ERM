import { Body, Controller, Get, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "./prisma.service.js";
import { hash, verify } from "argon2";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { AuthGuard } from "./auth.js";

@Controller("auth")
export class AuthController {
  constructor(private db: PrismaService, private jwt: JwtService) {}

  @Post("login")
  async login(@Body() body: { login: string; password: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.db.user.findFirst({ where: { login: body.login, active: true, deletedAt: null } });
    if (!user || (user.lockedUntil && user.lockedUntil > new Date()) || !(await verify(user.passwordHash, body.password))) {
      if (user) {
        const attempts = user.failedLoginAttempts + 1;
        await this.db.user.update({ where: { id: user.id }, data: {
          failedLoginAttempts: attempts, lockedUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null
        }});
      }
      throw new UnauthorizedException("Credenciais inválidas");
    }
    const sessionId = randomUUID();
    const payload = { sub: user.id, organizationId: user.organizationId, role: user.role, name: user.name, sid: sessionId };
    const access = await this.jwt.signAsync(payload, { expiresIn: "15m" });
    const refresh = await this.jwt.signAsync(payload, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: "7d" });
    await this.db.$transaction([
      this.db.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null, lastAccessAt: new Date() } }),
      this.db.session.create({ data: {
        id: sessionId, userId: user.id, refreshTokenHash: await hash(refresh),
        ipAddress: req.ip, userAgent: req.headers["user-agent"], expiresAt: new Date(Date.now() + 7 * 86_400_000)
      }})
    ]);
    const secure = process.env.COOKIE_SECURE === "true";
    res.cookie("access_token", access, { httpOnly: true, sameSite: "strict", secure, maxAge: 15 * 60_000 });
    res.cookie("refresh_token", refresh, { httpOnly: true, sameSite: "strict", secure, maxAge: 7 * 86_400_000 });
    return { user: { id: user.id, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword } };
  }

  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.access_token as string | undefined;
    if (token) {
      try {
        const data = this.jwt.decode<{ sid: string }>(token);
        if (data?.sid) await this.db.session.updateMany({ where: { id: data.sid }, data: { revokedAt: new Date() } });
      } catch {}
    }
    res.clearCookie("access_token"); res.clearCookie("refresh_token");
    return { ok: true };
  }

  @Get("me")
  @UseGuards(AuthGuard)
  async me(@Req() req: Request & { user: { sub: string } }) {
    const user = await this.db.user.findFirstOrThrow({
      where: { id: req.user.sub, active: true, deletedAt: null },
      select: { id: true, name: true, login: true, role: true, jobTitle: true, mustChangePassword: true }
    });
    return { user };
  }
}
