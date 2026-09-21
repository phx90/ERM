CREATE TABLE "ProductRegistrationRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "references" TEXT NOT NULL,
    "referenceLinks" TEXT[] NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductRegistrationRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductRegistrationRequest_organizationId_createdAt_idx"
ON "ProductRegistrationRequest"("organizationId", "createdAt");

ALTER TABLE "ProductRegistrationRequest"
ADD CONSTRAINT "ProductRegistrationRequest_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductRegistrationRequest"
ADD CONSTRAINT "ProductRegistrationRequest_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
