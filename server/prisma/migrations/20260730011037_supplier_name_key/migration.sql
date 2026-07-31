/*
  Adds a unique, case-insensitive identity for supplier names so the same
  supplier cannot be recorded twice as "Acme", "ACME" and "acme".

  Existing rows are backfilled with lower(trim(name)), which matches what
  supplierNameKey() computes in the application: every current supplier name is
  plain ASCII with single spaces, so no Unicode normalisation or whitespace
  collapsing is needed for them. The backfill is verified after migrating.
*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Supplier" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL
);
INSERT INTO "new_Supplier" ("id", "name", "nameKey") SELECT "id", "name", lower(trim("name")) FROM "Supplier";
DROP TABLE "Supplier";
ALTER TABLE "new_Supplier" RENAME TO "Supplier";
CREATE UNIQUE INDEX "Supplier_nameKey_key" ON "Supplier"("nameKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
