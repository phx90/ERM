import { Criticality, PrismaClient, PurchaseOrderStatus, type Product } from "@prisma/client";

const db = new PrismaClient();
const organizationId = "00000000-0000-0000-0000-000000000001";
const marker = "[DADOS DEMONSTRATIVOS]";
const descriptions = [
  "ABAFADOR DE RUÍDO TIPO CONCHA", "AVENTAL DE RASPA PARA SOLDADOR", "BROCA AÇO RÁPIDO 8 MM",
  "CABO ELÉTRICO FLEXÍVEL 750 V", "CAPACETE DE SEGURANÇA COM CARNEIRA", "CHAVE COMBINADA 17 MM",
  "DISCO DE CORTE 7 POLEGADAS", "ELETRODO REVESTIDO E7018", "FILTRO PARA RESPIRADOR",
  "FITA ISOLANTE PROFISSIONAL", "LUVA DE VAQUETA CANO LONGO", "MÁSCARA DE SOLDA AUTOMÁTICA",
  "ÓCULOS DE PROTEÇÃO INCOLOR", "PARAFUSO SEXTAVADO ZINCADO", "ROLAMENTO DE ESFERAS",
  "TINTA ESMALTE INDUSTRIAL", "TRAVA-QUEDAS PARA CABO DE AÇO", "UNIFORME OPERACIONAL",
  "VÁLVULA ESFERA EM LATÃO", "SAPATO DE SEGURANÇA COM BIQUEIRA"
];
const units = ["UN", "PC", "KG", "M", "CX", "PCT", "L", "PAR"];
const groups = ["EPI", "FERRAMENTAS", "ELÉTRICA", "SOLDA", "CONSUMÍVEIS", "MANUTENÇÃO", "UNIFORMES"];
const projects = ["BALSA-MRS", "TITAN", "ESTALEIRO", "OFICINA", "ADMINISTRATIVO"];
const departments = ["Almoxarifado", "Manutenção", "Produção", "Segurança do Trabalho", "Administrativo"];
const requesters = ["Elaine Oliveira", "Marcos Silva", "Ana Souza", "Carlos Santos", "Fernanda Lima", "João Pereira"];
const supplierNames = ["Metal Forte Industrial", "Casa das Ferramentas", "EPI Brasil Suprimentos", "Elétrica Nacional", "Solda Mais Distribuidora", "Uniformes Corporativos"];

function decimal(seed: number, min: number, max: number) {
  return Number((min + ((seed * 37) % 1000) / 1000 * (max - min)).toFixed(2));
}

const admin = await db.user.findFirstOrThrow({ where: { organizationId, role: "ADMIN", deletedAt: null } });
const statusList = await db.requestStatus.findMany({ where: { organizationId, active: true } });
const statusByCode = Object.fromEntries(statusList.map(status => [status.code, status]));
const statusCodes = ["AGUARDANDO_AQUISICAO", "EM_NEGOCIACAO", "PEDIDO_REALIZADO", "EM_TRANSPORTE", "ENTREGUE", "ATRASADO", "CANCELADO"];

const departmentRecords = [];
for (const name of departments) {
  const normalizedName = name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
  departmentRecords.push(await db.department.upsert({
    where: { organizationId_normalizedName: { organizationId, normalizedName } },
    update: { name },
    create: { organizationId, name, normalizedName }
  }));
}

const projectRecords = [];
for (const code of projects) {
  projectRecords.push(await db.project.upsert({
    where: { organizationId_code: { organizationId, code } },
    update: {},
    create: { organizationId, code, name: code.replaceAll("-", " ") }
  }));
}

const suppliers = [];
for (const legalName of supplierNames) {
  const normalizedName = legalName.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
  suppliers.push(await db.supplier.upsert({
    where: { organizationId_normalizedName: { organizationId, normalizedName } },
    update: {},
    create: {
      organizationId, legalName, normalizedName, tradeName: legalName.split(" ").slice(0, 2).join(" "),
      contact: "Equipe Comercial", phone: "(11) 3000-0000", email: `vendas@${normalizedName.toLowerCase().replaceAll(" ", "")}.test`, active: true
    }
  }));
}

const products: Product[] = [];
for (let index = 1; index <= 160; index++) {
  const code = `TST${String(index).padStart(5, "0")}`;
  const description = `${descriptions[(index - 1) % descriptions.length]} - MODELO ${String(index).padStart(3, "0")}`;
  const minimumStock = (index % 8) + 2;
  const stockBalance = index % 5 === 0 ? 0 : index % 4 === 0 ? minimumStock - 1 : minimumStock + (index % 18);
  products.push(await db.product.upsert({
    where: { organizationId_code: { organizationId, code } },
    update: {},
    create: {
      organizationId, code, genericDescription: description, type: index % 3 === 0 ? "MC" : "PS",
      unit: units[index % units.length], productGroup: groups[index % groups.length],
      stockBalance, minimumStock, unitCost: decimal(index, 4, 980), projectCode: projects[index % projects.length],
      note: marker, ca: index % 4 === 0 ? String(30000 + index) : null, active: true, lastSyncedAt: new Date()
    }
  }));
}

let requestCount = 0;
let itemCount = 0;
let orderCount = 0;
let deliveryCount = 0;
for (const year of [2024, 2025, 2026]) {
  for (let sequence = 1; sequence <= 40; sequence++) {
    const number = String(year * 1000 + sequence);
    const existing = await db.purchaseRequest.findUnique({ where: { organizationId_number: { organizationId, number } } });
    if (existing) continue;
    const statusCode = statusCodes[(sequence + year) % statusCodes.length];
    const status = statusByCode[statusCode];
    const requestDate = new Date(year, sequence % 12, (sequence * 3) % 27 + 1, 10, 0, 0);
    const department = departmentRecords[sequence % departmentRecords.length];
    const project = projectRecords[sequence % projectRecords.length];
    const itemTotal = 3 + (sequence % 6);
    const created = await db.purchaseRequest.create({
      data: {
        organizationId, number, requestDate, departmentId: department.id, projectId: project.id,
        requesterOriginal: requesters[sequence % requesters.length], aggregateStatus: status.label,
        notes: `${marker} Solicitação ${sequence} de ${year}`, createdById: admin.id, updatedById: admin.id,
        items: {
          create: Array.from({ length: itemTotal }, (_, itemIndex) => {
            const product = products[(sequence * 7 + itemIndex * 11 + year) % products.length];
            const quantity = 1 + ((sequence + itemIndex * 3) % 35);
            const itemStatusCode = statusCodes[(sequence + itemIndex + year) % statusCodes.length];
            return {
              productId: product.id, manualCode: product.code, description: product.genericDescription,
              quantity, requestedQuantity: quantity, unit: product.unit || "UN", stockSnapshot: product.stockBalance,
              criticality: [Criticality.BAIXA, Criticality.MEDIA, Criticality.ALTA][(sequence + itemIndex) % 3],
              application: `${groups[(sequence + itemIndex) % groups.length]} / ${projects[(sequence + itemIndex) % projects.length]}`,
              note: marker, statusId: statusByCode[itemStatusCode].id,
              purchasedQuantity: ["PEDIDO_REALIZADO", "EM_TRANSPORTE", "ENTREGUE", "ATRASADO"].includes(itemStatusCode) ? quantity : 0,
              deliveredQuantity: itemStatusCode === "ENTREGUE" ? quantity : 0
            };
          })
        }
      },
      include: { items: true }
    });
    requestCount++;
    itemCount += created.items.length;

    if (!["AGUARDANDO_AQUISICAO", "EM_NEGOCIACAO", "CANCELADO"].includes(statusCode)) {
      const supplier = suppliers[sequence % suppliers.length];
      const expectedAt = new Date(requestDate); expectedAt.setDate(expectedAt.getDate() + 15 + sequence % 25);
      const acquiredAt = new Date(requestDate); acquiredAt.setDate(acquiredAt.getDate() + 2 + sequence % 8);
      const order = await db.purchaseOrder.create({
        data: {
          organizationId, number: `OC-${year}-${String(sequence).padStart(4, "0")}`, supplierId: supplier.id, buyerId: admin.id,
          acquiredAt, expectedAt, status: statusCode === "ENTREGUE" ? PurchaseOrderStatus.RECEBIDA : PurchaseOrderStatus.EMITIDA,
          note: marker, totalValue: created.items.reduce((sum, item, idx) => sum + Number(item.quantity) * decimal(idx + sequence, 10, 300), 0),
          items: {
            create: created.items.map((item, idx) => ({
              description: item.description, quantity: item.quantity, unitPrice: decimal(idx + sequence, 10, 300),
              allocations: { create: [{ requestItemId: item.id, quantity: item.quantity }] }
            }))
          }
        },
        include: { items: true }
      });
      orderCount++;
      if (statusCode === "ENTREGUE") {
        const deliveredAt = new Date(expectedAt); deliveredAt.setDate(deliveredAt.getDate() - (sequence % 4));
        await db.delivery.create({
          data: {
            orderId: order.id, deliveredAt, receivedById: admin.id, note: marker, partial: false,
            items: { create: order.items.map(item => ({ orderItemId: item.id, quantity: item.quantity })) }
          }
        });
        deliveryCount++;
      }
    }
  }
}

await db.auditLog.create({
  data: {
    organizationId, userId: admin.id, action: "SEED_DEMO", entity: "Environment", entityId: organizationId,
    after: { products: products.length, requests: requestCount, items: itemCount, orders: orderCount, deliveries: deliveryCount },
    changedFields: ["products", "requests", "items", "orders", "deliveries"], correlationId: `seed-demo-${Date.now()}`
  }
});

console.log(JSON.stringify({
  productsAvailable: products.length,
  requestsCreated: requestCount,
  itemsCreated: itemCount,
  ordersCreated: orderCount,
  deliveriesCreated: deliveryCount,
  note: "Reexecuções ignoram solicitações e produtos já existentes."
}, null, 2));
await db.$disconnect();
