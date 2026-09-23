import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { AuthGuard } from "./auth.js";
import { PrismaService } from "./prisma.service.js";

@Controller("dashboard")
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private db: PrismaService) {}
  @Get()
  async summary(@Req() req: Request & { user: { organizationId: string } }) {
    const org = req.user.organizationId;
    const year = new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    const [
      requests,
      items,
      products,
      groupedStatuses,
      groupedCriticality,
      statusCatalog,
      recentRequests,
      lowStock,
      quantities,
      orderValue,
      monthlyRows,
    ] = await Promise.all([
      this.db.purchaseRequest.count({
        where: { organizationId: org, deletedAt: null },
      }),
      this.db.purchaseRequestItem.count({
        where: { request: { organizationId: org }, deletedAt: null },
      }),
      this.db.product.count({ where: { organizationId: org, active: true } }),
      this.db.purchaseRequestItem.groupBy({
        by: ["statusId"],
        where: { request: { organizationId: org }, deletedAt: null },
        _count: true,
        orderBy: { statusId: "asc" },
      }),
      this.db.purchaseRequestItem.groupBy({
        by: ["criticality"],
        where: { request: { organizationId: org }, deletedAt: null },
        _count: true,
      }),
      this.db.requestStatus.findMany({
        where: { organizationId: org, active: true },
        select: {
          id: true,
          code: true,
          label: true,
          color: true,
          terminal: true,
        },
      }),
      this.db.purchaseRequest.findMany({
        where: { organizationId: org, deletedAt: null },
        orderBy: [{ requestDate: "desc" }, { createdAt: "desc" }],
        take: 6,
        select: {
          id: true,
          number: true,
          requestDate: true,
          requesterOriginal: true,
          aggregateStatus: true,
          department: { select: { name: true } },
          createdBy: { select: { name: true } },
          _count: { select: { items: true } },
        },
      }),
      this.db.product.count({
        where: {
          organizationId: org,
          active: true,
          OR: [
            { stockBalance: { lte: 0 } },
            {
              minimumStock: { not: null },
              stockBalance: { lte: this.db.product.fields.minimumStock },
            },
          ],
        },
      }),
      this.db.purchaseRequestItem.aggregate({
        where: { request: { organizationId: org }, deletedAt: null },
        _sum: { requestedQuantity: true, deliveredQuantity: true },
      }),
      this.db.purchaseOrder.aggregate({
        where: { organizationId: org, deletedAt: null },
        _sum: { totalValue: true },
        _count: true,
      }),
      this.db.$queryRaw<
        Array<{ month: number; requests: number; items: number }>
      >(Prisma.sql`
        SELECT
          EXTRACT(MONTH FROM request."requestDate")::int AS month,
          COUNT(DISTINCT request.id)::int AS requests,
          COUNT(item.id)::int AS items
        FROM "PurchaseRequest" request
        LEFT JOIN "PurchaseRequestItem" item
          ON item."requestId" = request.id AND item."deletedAt" IS NULL
        WHERE request."organizationId" = ${org}
          AND request."deletedAt" IS NULL
          AND request."requestDate" >= ${yearStart}
        GROUP BY EXTRACT(MONTH FROM request."requestDate")
        ORDER BY month
      `),
    ]);
    const statusMap = new Map(
      statusCatalog.map((status) => [status.id, status]),
    );
    const statuses = groupedStatuses
      .map((group) => ({
        ...statusMap.get(group.statusId),
        count: group._count,
      }))
      .filter((status) => status.label);
    const pendingItems = statuses
      .filter((status) => !status.terminal && status.code !== "CANCELADO")
      .reduce((sum, status) => sum + status.count, 0);
    const overdueItems =
      statuses.find((status) => status.code === "ATRASADO")?.count || 0;
    const requested = Number(quantities._sum.requestedQuantity || 0);
    const delivered = Number(quantities._sum.deliveredQuantity || 0);
    const monthly = Array.from({ length: 12 }, (_, month) => ({
      month,
      requests: 0,
      items: 0,
    }));
    monthlyRows.forEach((row) => {
      const bucket = monthly[row.month - 1];
      if (!bucket) return;
      bucket.requests = row.requests;
      bucket.items = row.items;
    });
    return {
      totals: {
        requests,
        items,
        products,
        pendingItems,
        overdueItems,
        lowStock,
        orders: orderValue._count,
        orderValue: Number(orderValue._sum.totalValue || 0),
        fulfillmentRate: requested
          ? Math.round((delivered / requested) * 100)
          : 0,
      },
      statuses,
      criticality: groupedCriticality.map((group) => ({
        label: group.criticality,
        count: group._count,
      })),
      monthly,
      recentRequests: recentRequests.map((request) => ({
        ...request,
        items: request._count.items,
        _count: undefined,
      })),
      updatedAt: new Date().toISOString(),
    };
  }
}
