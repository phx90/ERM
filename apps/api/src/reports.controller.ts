import { Controller, Get, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthGuard } from "./auth.js";
import { PrismaService } from "./prisma.service.js";
import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

function copyRowFormatting(
  source: ExcelJS.Row,
  destination: ExcelJS.Row,
  columns: number,
) {
  destination.height = source.height;
  for (let column = 1; column <= columns; column++) {
    const from = source.getCell(column);
    const to = destination.getCell(column);
    to.style = { ...from.style };
    to.numFmt = from.numFmt;
    to.alignment = from.alignment ? { ...from.alignment } : {};
    to.protection = from.protection ? { ...from.protection } : {};
  }
}

@Controller("reports")
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private db: PrismaService) {}
  @Get("consolidated")
  async consolidated(
    @Req() req: Request & { user: { sub: string; organizationId: string } },
    @Res() res: Response,
    @Query("year") year = String(new Date().getFullYear()),
  ) {
    const numericYear = Number(year);
    if (
      !Number.isInteger(numericYear) ||
      numericYear < 2000 ||
      numericYear > 2100
    ) {
      return res.status(400).json({ message: "Ano inválido." });
    }
    const template =
      process.env.EXCEL_TEMPLATE_PATH ||
      "/app/templates/SOLICITACAO_DE_COMPRA_ERT_ERM.xlsx";
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(template);

    // O arquivo original é a fonte visual: abas, fórmulas, larguras,
    // impressão, validações e visibilidade são preservadas.
    const legacyQuoteSheet = workbook.getWorksheet("Planilha2");
    if (legacyQuoteSheet) {
      legacyQuoteSheet.getCell("A60").value = null;
      legacyQuoteSheet.getCell("B60").value = null;
    }
    const products = await this.db.product.findMany({
      where: { organizationId: req.user.organizationId, active: true },
      orderBy: [{ genericDescription: "asc" }, { code: "asc" }],
    });
    const stockSheet = workbook.getWorksheet("LISTA ESTOQUE");
    if (stockSheet) {
      const stockStyleRow = stockSheet.getRow(2);
      const oldLastRow = Math.max(stockSheet.rowCount, 2);
      for (let rowNumber = 2; rowNumber <= oldLastRow; rowNumber++) {
        for (let column = 1; column <= 11; column++)
          stockSheet.getRow(rowNumber).getCell(column).value = null;
      }
      products.forEach((product, index) => {
        const row = stockSheet.getRow(index + 2);
        copyRowFormatting(stockStyleRow, row, 11);
        row.values = [
          product.code,
          product.genericDescription,
          product.type || "",
          product.unit || "",
          product.productGroup || "",
          product.socpCode || "",
          Number(product.stockBalance),
          product.projectCode || "",
          product.unitCost == null ? null : Number(product.unitCost),
          product.note || "",
          product.ca || "",
        ];
        row.getCell(1).numFmt = "@";
        row.getCell(6).numFmt = "@";
        row.getCell(7).numFmt = "#,##0.000";
        row.getCell(9).numFmt = "R$ #,##0.0000";
      });
      stockSheet.autoFilter = {
        from: "A1",
        to: `K${Math.max(2, products.length + 1)}`,
      };
    }

    const sheetName = `Lista de compra - ${year}`;
    const sheet =
      workbook.getWorksheet(sheetName) ||
      workbook.addWorksheet(sheetName, {
        pageSetup: {
          orientation: "landscape",
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
        },
      });
    const headerRow = 2;
    const startRow = headerRow + 1;
    const records = await this.db.purchaseRequest.findMany({
      where: {
        organizationId: req.user.organizationId,
        deletedAt: null,
        requestDate: {
          gte: new Date(`${year}-01-01T00:00:00-03:00`),
          lt: new Date(`${numericYear + 1}-01-01T00:00:00-03:00`),
        },
      },
      include: {
        items: {
          where: { deletedAt: null },
          include: {
            product: true,
            status: true,
            allocations: {
              include: {
                orderItem: {
                  include: {
                    order: {
                      include: {
                        supplier: true,
                        deliveries: {
                          orderBy: { deliveredAt: "desc" },
                          take: 1,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        department: true,
        project: true,
      },
      orderBy: [{ requestDate: "asc" }, { number: "asc" }],
    });
    const annualStyleRow = sheet.getRow(startRow);
    for (let rowNumber = startRow; rowNumber <= sheet.rowCount; rowNumber++) {
      for (let column = 1; column <= 19; column++)
        sheet.getRow(rowNumber).getCell(column).value = null;
    }
    const rows = records.flatMap((r) =>
      r.items.map((item) => {
        const order = item.allocations[0]?.orderItem.order;
        const deliveredAt = order?.deliveries[0]?.deliveredAt;
        return [
          r.number,
          item.buyerId || "",
          order?.number || "",
          r.requestDate,
          r.requesterOriginal || "",
          r.department?.name || "",
          item.product?.code || item.manualCode || "",
          item.description,
          Number(item.quantity),
          item.unit,
          r.project?.code || "",
          item.criticality,
          item.application || item.note || "",
          item.status.label,
          order?.supplier.legalName || "",
          order?.acquiredAt || null,
          order?.expectedAt || null,
          deliveredAt || null,
          null,
        ];
      }),
    );
    rows.forEach((row, index) => {
      const destination = sheet.getRow(startRow + index);
      copyRowFormatting(annualStyleRow, destination, 19);
      destination.values = row;
      destination.getCell(1).numFmt = "@";
      destination.getCell(3).numFmt = "@";
      destination.getCell(7).numFmt = "@";
      destination.getCell(4).numFmt = "dd/mm/yyyy";
      for (const col of [16, 17, 18])
        destination.getCell(col).numFmt = "dd/mm/yyyy";
      destination.getCell(19).value = {
        formula: `IF(OR(D${destination.number}="",P${destination.number}=""),"",P${destination.number}-D${destination.number})`,
        result:
          row[15] instanceof Date
            ? Math.max(
                0,
                Math.round(
                  (row[15].getTime() - (row[3] as Date).getTime()) / 86400000,
                ),
              )
            : "",
      };
      destination.getCell(19).numFmt = "0";
    });
    sheet.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: Math.max(headerRow, startRow + rows.length - 1), column: 19 },
    };
    sheet.views = [{ state: "frozen", ySplit: headerRow }];
    sheet.pageSetup.orientation = "landscape";
    sheet.pageSetup.fitToPage = true;
    sheet.pageSetup.fitToWidth = 1;
    sheet.pageSetup.fitToHeight = 0;
    sheet.pageSetup.printArea = `A1:S${Math.max(headerRow, startRow + rows.length - 1)}`;
    const safe = `SOLICITACAO_DE_COMPRA_ERM_${year}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const outputDir = process.env.REPORTS_PATH || "/app/reports";
    await mkdir(outputDir, { recursive: true });
    const output = path.join(outputDir, safe);
    await workbook.xlsx.writeFile(output);
    await this.db.reportGeneration.create({
      data: {
        organizationId: req.user.organizationId,
        type: "CONSOLIDATED",
        fileName: safe,
        filters: { year },
        createdById: req.user.sub,
      },
    });
    res.download(output, safe);
  }
}
