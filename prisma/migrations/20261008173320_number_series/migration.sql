-- Give document numbering a `series` discriminator.
--
-- Fee receipts (RC) and accounts vouchers (VCH) must each be gapless on their
-- own run, so they cannot share one counter. Existing rows are all receipts.

ALTER TABLE "receipt_sequences"
  ADD COLUMN "series" TEXT NOT NULL DEFAULT 'RECEIPT';

DROP INDEX "receipt_sequences_branchId_financialYear_key";

CREATE UNIQUE INDEX "receipt_sequences_branchId_financialYear_series_key"
  ON "receipt_sequences" ("branchId", "financialYear", "series");
