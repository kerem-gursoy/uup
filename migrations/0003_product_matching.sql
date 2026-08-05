-- Teaches the app to remember what a supplier's own wording for a line meant.
--
-- Until now every invoice line arrived at the review screen with no product on
-- it, and a person picked one by hand - the same person, picking the same
-- product, for the same supplier's same code, every week. SupplierItem is the
-- record of those decisions, written when an invoice is applied and read back
-- the next time that supplier sends one.
--
-- Nothing here is inferred. A row exists only because somebody applied an
-- invoice with that line on it, which is what lets the matcher treat a hit as
-- certain rather than as a suggestion. See services/productMatching.ts.

CREATE TABLE "SupplierItem" (
    "id"           INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
    "supplierId"   INTEGER  NOT NULL,
    -- 'CODE' for the supplier's stock code, 'DESC' for the line description.
    "kind"         TEXT     NOT NULL,
    "value"        TEXT     NOT NULL,
    "productId"    INTEGER  NOT NULL,
    "lastSeenText" TEXT,
    "timesSeen"    INTEGER  NOT NULL DEFAULT 1,
    "updatedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierItem_supplierId_fkey" FOREIGN KEY ("supplierId")
        REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SupplierItem_productId_fkey"  FOREIGN KEY ("productId")
        REFERENCES "Product" ("id")  ON DELETE RESTRICT ON UPDATE CASCADE
);

-- One mapping per supplier per piece of evidence. The upsert on apply leans on
-- this: the most recent human decision replaces the previous one, so a supplier
-- who reuses an old code for a new product corrects itself on first apply
-- instead of leaving two rows to disagree.
CREATE UNIQUE INDEX "SupplierItem_supplierId_kind_value_key"
    ON "SupplierItem" ("supplierId", "kind", "value");

-- Deleting a product has to clear its mappings first; this is what makes that
-- lookup cheap rather than a scan.
CREATE INDEX "SupplierItem_productId_idx" ON "SupplierItem" ("productId");

-- Case-, accent- and punctuation-folded product name. Nullable with no default
-- and no backfill here: every existing row reads as "not computed yet", and
-- controllers/products.ts fills one in whenever a product is created or edited.
-- Search falls back to the raw name, so nothing is invisible in the meantime.
ALTER TABLE "Product" ADD COLUMN "nameFingerprint" TEXT;

CREATE INDEX "Product_nameFingerprint_idx" ON "Product" ("nameFingerprint");
