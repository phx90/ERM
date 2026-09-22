// Run against an initialized local/test API: node test/stock.integration.mjs
// Creates isolated organizations and removes only its own fixtures in finally.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";
const db = new PrismaClient();
const base = process.env.STOCK_TEST_URL || "http://localhost:3000/api";
const orgId = randomUUID(),
  otherOrgId = randomUUID();
const password = randomUUID();
let checks = 0;
const verify = (actual, expected) => {
  assert.deepEqual(actual, expected);
  checks++;
};
async function call(path, method = "GET", body, cookie) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; "),
  };
}
try {
  await db.organization.createMany({
    data: [
      { id: orgId, name: "TEST stock isolated" },
      { id: otherOrgId, name: "TEST stock other" },
    ],
  });
  const passwordHash = await hash(password);
  const cookies = {};
  for (const role of ["ADMIN", "COMPRAS", "CONSULTA", "ALMOXARIFADO"]) {
    const login = `stock-test-${randomUUID()}`;
    await db.user.create({
      data: {
        organizationId: orgId,
        name: `Teste ${role}`,
        login,
        role,
        passwordHash,
      },
    });
    const result = await call("/auth/login", "POST", { login, password });
    verify(result.status, 201);
    cookies[role] = result.cookie;
  }
  const cookie = cookies.ALMOXARIFADO;
  verify((await call("/stock")).status, 401);
  const created = await call(
    "/products",
    "POST",
    {
      code: "TEST-STOCK",
      genericDescription: "Material de teste isolado",
      unit: "UN",
    },
    cookie,
  );
  verify(created.status, 201);
  const id = created.data.id;
  const move = (body, who = cookie) =>
    call(
      `/stock/${id}/movements`,
      "POST",
      { operationId: randomUUID(), ...body },
      who,
    );
  const state = () => db.product.findUniqueOrThrow({ where: { id } });
  verify(
    (
      await move(
        { type: "AJUSTE", quantity: 10, version: 0, note: "Contagem inicial" },
        cookies.CONSULTA,
      )
    ).status,
    403,
  );
  verify(
    (
      await move(
        { type: "AJUSTE", quantity: 10, version: 0, note: "Contagem inicial" },
        cookies.COMPRAS,
      )
    ).status,
    403,
  );
  verify(
    (
      await call(
        `/stock/${id}/minimum`,
        "PATCH",
        { minimumStock: 2 },
        cookies.CONSULTA,
      )
    ).status,
    403,
  );
  verify(
    (await move({ type: "INICIAL", quantity: 10, version: 0 })).status,
    400,
  );
  verify(
    (await move({ type: "ENTRADA", quantity: 10, version: 0 })).status,
    400,
  );
  verify((await move({ type: "SAIDA", quantity: 10, version: 0 })).status, 400);
  verify((await state()).stockBalance.toString(), "0");
  verify(
    (await move({ type: "AJUSTE", quantity: 10, version: 0 })).status,
    400,
  );
  const operation = {
    operationId: randomUUID(),
    type: "AJUSTE",
    quantity: 10,
    version: 0,
    reference: "Inventario teste",
    note: "Contagem fisica inicial",
  };
  const adjustment = await move(operation);
  verify(adjustment.status, 201);
  const repeat = await move(operation);
  verify(repeat.status, 201);
  verify(repeat.data.id, adjustment.data.id);
  verify((await move({ ...operation, quantity: 11 })).status, 409);
  verify((await state()).stockBalance.toString(), "10");
  const concurrent = await Promise.all([
    move({
      type: "AJUSTE",
      quantity: 8,
      version: 1,
      note: "Recontagem concorrente A",
    }),
    move({
      type: "AJUSTE",
      quantity: 9,
      version: 1,
      note: "Recontagem concorrente B",
    }),
  ]);
  verify(concurrent.map((r) => r.status).sort(), [201, 409]);
  const afterConcurrent = await state();
  verify(["8", "9"].includes(afterConcurrent.stockBalance.toString()), true);
  verify(afterConcurrent.stockVersion, 2);
  verify(
    (
      await call(
        `/stock/${id}/minimum`,
        "PATCH",
        { minimumStock: afterConcurrent.stockBalance.toString() },
        cookie,
      )
    ).status,
    200,
  );
  const low = await call(
    "/stock?status=low",
    "GET",
    undefined,
    cookies.CONSULTA,
  );
  verify(low.data.total, 1);
  verify(low.data.summary.below, 1);
  verify(
    (await call("/products?stock=below", "GET", undefined, cookie)).data.total,
    1,
  );
  verify(
    (await call(`/products/${id}`, "PATCH", { stockBalance: 99 }, cookie))
      .status,
    400,
  );
  verify(
    (await call(`/products/${id}`, "PATCH", { unit: "CX" }, cookie)).status,
    400,
  );
  verify(
    (await call(`/stock/${id}/minimum`, "PATCH", { minimumStock: -2 }, cookie))
      .status,
    400,
  );
  const foreign = await db.product.create({
    data: {
      organizationId: otherOrgId,
      code: "OTHER",
      genericDescription: "Outro",
      stockBalance: 5,
    },
  });
  verify(
    (
      await call(
        `/stock/${foreign.id}/movements`,
        "POST",
        {
          operationId: randomUUID(),
          type: "AJUSTE",
          quantity: 1,
          version: 0,
          note: "Contagem externa",
        },
        cookie,
      )
    ).status,
    404,
  );
  verify(
    (
      await call(
        `/stock/${foreign.id}/minimum`,
        "PATCH",
        { minimumStock: 1 },
        cookie,
      )
    ).status,
    404,
  );
  verify(
    (
      await call(
        `/stock/movements?productId=${foreign.id}`,
        "GET",
        undefined,
        cookie,
      )
    ).data.total,
    0,
  );
  const history = await call(
    `/stock/movements?productId=${id}`,
    "GET",
    undefined,
    cookie,
  );
  verify(history.data.total, 2);
  verify(history.data.data[0].actorName, "Teste ALMOXARIFADO");
  verify(
    await db.auditLog.count({
      where: { organizationId: orgId, action: { startsWith: "STOCK_" } },
    }),
    3,
  );
  verify(
    (await call("/stock/movements?from=invalid", "GET", undefined, cookie))
      .status,
    400,
  );
  verify(
    (
      await call(
        `/stock/${id}/minimum`,
        "PATCH",
        { minimumStock: null },
        cookie,
      )
    ).status,
    200,
  );
  verify(
    (await call("/stock?status=low", "GET", undefined, cookie)).data.total,
    0,
  );
  verify(
    (
      await move({
        type: "AJUSTE",
        quantity: 0,
        version: 2,
        note: "Contagem fisica zerada",
      })
    ).status,
    201,
  );
  verify(
    (await call("/stock?status=zero", "GET", undefined, cookie)).data.total,
    1,
  );
  verify((await call("/auth/logout", "POST", {}, cookie)).status, 201);
  verify((await call("/stock", "GET", undefined, cookie)).status, 401);
  console.log(
    `PASS: ${checks} verificações de estoque, concorrência, isolamento, auditoria e permissões.`,
  );
} finally {
  await db.auditLog.deleteMany({
    where: { organizationId: { in: [orgId, otherOrgId] } },
  });
  await db.stockMovement.deleteMany({
    where: { product: { organizationId: { in: [orgId, otherOrgId] } } },
  });
  await db.product.deleteMany({
    where: { organizationId: { in: [orgId, otherOrgId] } },
  });
  await db.user.deleteMany({
    where: { organizationId: { in: [orgId, otherOrgId] } },
  });
  await db.organization.deleteMany({
    where: { id: { in: [orgId, otherOrgId] } },
  });
  await db.$disconnect();
}
