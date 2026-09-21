CREATE TYPE "MaterialWithdrawalStatus" AS ENUM (
  'PENDENTE',
  'RETIRADA',
  'CANCELADA',
  'EXPIRADA'
);

CREATE TABLE "MaterialWithdrawal" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "status" "MaterialWithdrawalStatus" NOT NULL DEFAULT 'PENDENTE',
  "processedAt" TIMESTAMP(3),
  "processedById" TEXT,
  "canceledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  CONSTRAINT "MaterialWithdrawal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaterialWithdrawalItem" (
  "id" TEXT NOT NULL,
  "withdrawalId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  CONSTRAINT "MaterialWithdrawalItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StockMovement" ADD COLUMN "withdrawalItemId" TEXT;

CREATE UNIQUE INDEX "MaterialWithdrawal_organizationId_number_key"
ON "MaterialWithdrawal"("organizationId", "number");
CREATE INDEX "MaterialWithdrawal_organizationId_status_expiresAt_idx"
ON "MaterialWithdrawal"("organizationId", "status", "expiresAt");
CREATE INDEX "MaterialWithdrawal_requestedById_requestedAt_idx"
ON "MaterialWithdrawal"("requestedById", "requestedAt");
CREATE INDEX "MaterialWithdrawalItem_productId_idx"
ON "MaterialWithdrawalItem"("productId");
CREATE UNIQUE INDEX "StockMovement_withdrawalItemId_key"
ON "StockMovement"("withdrawalItemId");

ALTER TABLE "MaterialWithdrawal" ADD CONSTRAINT "MaterialWithdrawal_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialWithdrawal" ADD CONSTRAINT "MaterialWithdrawal_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialWithdrawal" ADD CONSTRAINT "MaterialWithdrawal_processedById_fkey"
FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaterialWithdrawalItem" ADD CONSTRAINT "MaterialWithdrawalItem_withdrawalId_fkey"
FOREIGN KEY ("withdrawalId") REFERENCES "MaterialWithdrawal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialWithdrawalItem" ADD CONSTRAINT "MaterialWithdrawalItem_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_withdrawalItemId_fkey"
FOREIGN KEY ("withdrawalItemId") REFERENCES "MaterialWithdrawalItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
