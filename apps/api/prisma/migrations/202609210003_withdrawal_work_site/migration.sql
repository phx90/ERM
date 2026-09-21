ALTER TABLE "MaterialWithdrawal"
ADD COLUMN "workSite" TEXT NOT NULL DEFAULT 'Não informada';

ALTER TABLE "MaterialWithdrawal"
ALTER COLUMN "workSite" DROP DEFAULT;
