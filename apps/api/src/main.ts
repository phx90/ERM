import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module.js";

const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.setGlobalPrefix("api");
app.use(cookieParser());
app.use(helmet());
app.enableCors({ origin: process.env.WEB_ORIGIN?.split(",") ?? true, credentials: true });
app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle("Compras ERT/ERM").setVersion("1.0").addCookieAuth("access_token").build());
SwaggerModule.setup("api/docs", app, document);
app.getHttpAdapter().get("/health", (_req: unknown, res: { json: (v: unknown) => void }) => res.json({ status: "ok" }));
await app.listen(Number(process.env.API_PORT || 3000), "0.0.0.0");
