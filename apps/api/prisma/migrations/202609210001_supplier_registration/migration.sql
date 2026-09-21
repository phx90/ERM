ALTER TABLE "Supplier"
ADD COLUMN "stateRegistration" TEXT,
ADD COLUMN "municipalRegistration" TEXT,
ADD COLUMN "postalCode" TEXT,
ADD COLUMN "street" TEXT,
ADD COLUMN "addressNumber" TEXT,
ADD COLUMN "complement" TEXT,
ADD COLUMN "district" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "country" TEXT NOT NULL DEFAULT 'Brasil',
ADD COLUMN "website" TEXT,
ADD COLUMN "paymentTerms" TEXT,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Supplier_organizationId_cnpj_idx"
ON "Supplier"("organizationId", "cnpj");

CREATE UNIQUE INDEX "Supplier_organizationId_cnpj_unique"
ON "Supplier"("organizationId", "cnpj")
WHERE "cnpj" IS NOT NULL;
