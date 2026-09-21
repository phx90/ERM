ALTER TABLE "PurchaseOrderItem" ADD COLUMN "productId" TEXT;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'UN';

UPDATE "PurchaseOrderItem" poi
SET "productId" = pri."productId", "unit" = pri."unit"
FROM "PurchaseAllocation" pa
JOIN "PurchaseRequestItem" pri ON pri."id" = pa."requestItemId"
WHERE pa."orderItemId" = poi."id" AND poi."productId" IS NULL;

ALTER TABLE "Delivery" ADD COLUMN "invoiceNumber" TEXT;
UPDATE "Delivery" SET "invoiceNumber" = 'LEGADO-' || LEFT("id", 8) WHERE "invoiceNumber" IS NULL;
ALTER TABLE "Delivery" ALTER COLUMN "invoiceNumber" SET NOT NULL;

ALTER TABLE "StockMovement" ADD COLUMN "deliveryItemId" TEXT;

CREATE UNIQUE INDEX "Delivery_orderId_invoiceNumber_key" ON "Delivery"("orderId", "invoiceNumber");
CREATE UNIQUE INDEX "StockMovement_deliveryItemId_key" ON "StockMovement"("deliveryItemId");
CREATE INDEX "PurchaseOrderItem_productId_idx" ON "PurchaseOrderItem"("productId");

ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_deliveryItemId_fkey" FOREIGN KEY ("deliveryItemId") REFERENCES "DeliveryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
