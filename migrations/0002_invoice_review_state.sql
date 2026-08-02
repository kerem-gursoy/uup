-- Keeps the review screen's work between visits.
--
-- Before this, opening an invoice for review re-read the photo with Gemini every
-- single time, and any editing done on that screen lived only in React state.
-- Switching apps mid-invoice therefore cost a paid model call and threw away
-- everything the reviewer had corrected.
--
-- `parsedJson` caches the reading (the document never changes, so neither does
-- the answer) and `draftJson` holds the unfinished review.
--
-- Added as nullable columns with no default: every existing row is simply a
-- invoice with nothing cached and no draft, which is exactly what NULL means
-- here. No backfill, and no rewrite of the table.
ALTER TABLE "Invoice" ADD COLUMN "parsedJson" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "parsedAt" DATETIME;
ALTER TABLE "Invoice" ADD COLUMN "draftJson" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "draftUpdatedAt" DATETIME;
