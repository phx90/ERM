ALTER TYPE "Role" ADD VALUE 'ALMOXARIFADO';
ALTER TYPE "StockMovementOrigin" ADD VALUE 'ENTRADA';
ALTER TYPE "StockMovementOrigin" ADD VALUE 'SAIDA';
ALTER TYPE "StockMovementOrigin" ADD VALUE 'INICIAL';
ALTER TABLE "Product" ADD COLUMN "stockVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StockMovement" ADD COLUMN "note" TEXT, ADD COLUMN "reference" TEXT, ADD COLUMN "actorName" TEXT, ADD COLUMN "operationId" TEXT;
CREATE UNIQUE INDEX "StockMovement_operationId_key" ON "StockMovement"("operationId");
CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");
-- Record an opening reference only where there is no previous movement. Preserve all balances.
INSERT INTO "StockMovement" ("id", "productId", "previousBalance", "newBalance", "origin", "userId", "actorName", "note", "createdAt")
SELECT 'opening-' || p."id", p."id", 0, p."stockBalance", 'IMPORTACAO', 'system', 'Sistema',
       'Saldo anterior à implantação do controle de estoque. Conferir na contagem física.', CURRENT_TIMESTAMP
FROM "Product" p WHERE p."stockBalance" <> 0 AND NOT EXISTS (SELECT 1 FROM "StockMovement" m WHERE m."productId" = p."id");
