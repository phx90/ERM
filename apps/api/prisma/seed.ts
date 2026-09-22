import { PrismaClient, Role } from "@prisma/client";
import { hash } from "argon2";

const db = new PrismaClient();
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 12)
  throw new Error("ADMIN_PASSWORD deve ter ao menos 12 caracteres.");
const organization = await db.organization.upsert({
  where: { id: "00000000-0000-0000-0000-000000000001" },
  update: {},
  create: {
    id: "00000000-0000-0000-0000-000000000001",
    name: "ERM",
  },
});
const department = await db.department.upsert({
  where: {
    organizationId_normalizedName: {
      organizationId: organization.id,
      normalizedName: "ALMOXARIFADO",
    },
  },
  update: {},
  create: {
    organizationId: organization.id,
    name: "Almoxarifado",
    normalizedName: "ALMOXARIFADO",
  },
});
for (const status of [
  ["RASCUNHO", "Rascunho", "#64748b"],
  ["AGUARDANDO_AQUISICAO", "AGUARDANDO AQUISIÇÃO", "#d97706"],
  ["EM_NEGOCIACAO", "EM NEGOCIAÇÃO", "#7c3aed"],
  ["PEDIDO_REALIZADO", "PEDIDO REALIZADO", "#2563eb"],
  ["EM_TRANSPORTE", "EM TRANSPORTE", "#0891b2"],
  ["ENTREGUE", "ENTREGUE", "#16a34a"],
  ["ATRASADO", "ATRASADO", "#dc2626"],
  ["CANCELADO", "CANCELADO", "#475569"],
] as const)
  await db.requestStatus.upsert({
    where: {
      organizationId_code: { organizationId: organization.id, code: status[0] },
    },
    update: {},
    create: {
      organizationId: organization.id,
      code: status[0],
      label: status[1],
      color: status[2],
      terminal: ["ENTREGUE", "CANCELADO"].includes(status[0]),
    },
  });
const users: Array<[string, string, Role]> = [
  [
    process.env.ADMIN_LOGIN || "admin",
    process.env.ADMIN_NAME || "Administrador",
    Role.ADMIN,
  ],
  ["almoxarifado", "Almoxarifado", Role.ALMOXARIFADO],
  ["compras", "Usuário Compras", Role.COMPRAS],
  ["solicitante", "Usuário Solicitante", Role.SOLICITANTE],
  ["consulta", "Usuário Consulta", Role.CONSULTA],
];
for (const [login, name, role] of users)
  await db.user.upsert({
    where: { organizationId_login: { organizationId: organization.id, login } },
    update: {},
    create: {
      organizationId: organization.id,
      login,
      name,
      role,
      departmentId: department.id,
      passwordHash: await hash(password),
      mustChangePassword: true,
    },
  });
await db.product.upsert({
  where: {
    organizationId_code: { organizationId: organization.id, code: "000210" },
  },
  update: {},
  create: {
    organizationId: organization.id,
    code: "000210",
    genericDescription: "ABAFADOR DE RUÍDO CONCHA K40",
    type: "PS",
    unit: "UN",
    productGroup: "18",
    stockBalance: 0,
  },
});
console.log("Seed concluído. Todos os usuários exigem troca da senha inicial.");
await db.$disconnect();
