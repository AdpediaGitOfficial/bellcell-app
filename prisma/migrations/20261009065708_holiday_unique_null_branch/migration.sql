-- Postgres treats NULLs as distinct in a UNIQUE constraint, so
-- @@unique([branchId, date]) does NOT stop two institute-wide holidays
-- (branchId IS NULL) landing on the same date. Caught by a browser pass:
-- "Children's Day" and "Duplicate" both saved on 2026-11-14.
--
-- Prisma's @@unique cannot express a partial index, so it is declared here
-- and the Holiday model carries a comment pointing at this file.
CREATE UNIQUE INDEX "holidays_date_institute_wide_key"
  ON "holidays" ("date")
  WHERE "branchId" IS NULL;
