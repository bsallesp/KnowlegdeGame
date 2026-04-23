ALTER TABLE "Topic"   ADD COLUMN "sourceBookId"    TEXT;
ALTER TABLE "Item"    ADD COLUMN "sourceStartPage" INTEGER;
ALTER TABLE "Item"    ADD COLUMN "sourceEndPage"   INTEGER;
ALTER TABLE "SubItem" ADD COLUMN "sourceStartPage" INTEGER;
ALTER TABLE "SubItem" ADD COLUMN "sourceEndPage"   INTEGER;

CREATE INDEX "Topic_sourceBookId_idx" ON "Topic"("sourceBookId");

ALTER TABLE "Topic"
  ADD CONSTRAINT "Topic_sourceBookId_fkey"
  FOREIGN KEY ("sourceBookId") REFERENCES "Book"("id") ON DELETE SET NULL ON UPDATE CASCADE;
