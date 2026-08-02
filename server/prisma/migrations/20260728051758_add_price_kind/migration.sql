/*
  PriceHistory now distinguishes cost (what we pay the supplier) from the
  selling price (what we charge the customer).

  Every pre-existing row was written by the invoice-apply flow from a supplier
  unit price, so they are all backfilled as "COST". Selling prices start empty
  and are entered by the user.
*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PriceHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "note" TEXT,
    "effectiveFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PriceHistory" ("effectiveFrom", "id", "kind", "priceCents", "productId") SELECT "effectiveFrom", "id", 'COST', "priceCents", "productId" FROM "PriceHistory";
DROP TABLE "PriceHistory";
ALTER TABLE "new_PriceHistory" RENAME TO "PriceHistory";
CREATE INDEX "PriceHistory_productId_kind_effectiveFrom_idx" ON "PriceHistory"("productId", "kind", "effectiveFrom");
CREATE UNIQUE INDEX "PriceHistory_productId_kind_effectiveFrom_key" ON "PriceHistory"("productId", "kind", "effectiveFrom");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
