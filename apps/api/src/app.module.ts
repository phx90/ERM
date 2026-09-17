import { StockController } from "./stock.controller.js";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { LoggerModule } from "nestjs-pino";
import { PrismaService } from "./prisma.service.js";
import { AuthController } from "./auth.controller.js";
import { RequestsController } from "./requests.controller.js";
import { DashboardController } from "./dashboard.controller.js";
import { AuthGuard } from "./auth.js";
import { ReportsController } from "./reports.controller.js";
import { ProductsController } from "./products.controller.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({ global: true, secret: process.env.JWT_ACCESS_SECRET }),
    LoggerModule.forRoot({ pinoHttp: { redact: ["req.headers.cookie", "req.body.password"], genReqId: req => String(req.headers["x-correlation-id"] || crypto.randomUUID()) } })
  ],
  controllers: [StockController, AuthController, RequestsController, DashboardController, ReportsController, ProductsController],
  providers: [PrismaService, AuthGuard]
})
export class AppModule {}
