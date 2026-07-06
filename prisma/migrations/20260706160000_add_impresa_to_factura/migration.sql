-- AlterTable
-- Adds the `impresa` column to track whether an invoice has been printed.
-- Default is false. Nullable during migration to avoid failing on existing rows.
ALTER TABLE "Factura" ADD COLUMN IF NOT EXISTS "impresa" BOOLEAN DEFAULT false;

-- Backfill: any existing rows get false (which is the default, but explicit is safer)
UPDATE "Factura" SET "impresa" = false WHERE "impresa" IS NULL;
