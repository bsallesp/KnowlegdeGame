CREATE TABLE "Book" (
  "id"             TEXT         NOT NULL,
  "userId"         TEXT         NOT NULL,
  "title"          TEXT         NOT NULL,
  "author"         TEXT,
  "mimeType"       TEXT         NOT NULL,
  "sha256"         TEXT         NOT NULL,
  "sourceUri"      TEXT         NOT NULL,
  "sizeBytes"      INTEGER      NOT NULL,
  "pageCount"      INTEGER      NOT NULL DEFAULT 0,
  "language"       TEXT,
  "status"         TEXT         NOT NULL DEFAULT 'uploaded',
  "extractionMode" TEXT,
  "errorMessage"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Book_userId_sha256_key" ON "Book"("userId", "sha256");
CREATE INDEX "Book_userId_createdAt_idx" ON "Book"("userId", "createdAt");
CREATE INDEX "Book_status_createdAt_idx" ON "Book"("status", "createdAt");

ALTER TABLE "Book"
  ADD CONSTRAINT "Book_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BookChapter" (
  "id"        TEXT    NOT NULL,
  "bookId"    TEXT    NOT NULL,
  "parentId"  TEXT,
  "title"     TEXT    NOT NULL,
  "order"     INTEGER NOT NULL,
  "startPage" INTEGER NOT NULL,
  "endPage"   INTEGER,

  CONSTRAINT "BookChapter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BookChapter_bookId_order_idx" ON "BookChapter"("bookId", "order");
CREATE INDEX "BookChapter_parentId_idx" ON "BookChapter"("parentId");

ALTER TABLE "BookChapter"
  ADD CONSTRAINT "BookChapter_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookChapter"
  ADD CONSTRAINT "BookChapter_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "BookChapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "BookPage" (
  "id"         TEXT    NOT NULL,
  "bookId"     TEXT    NOT NULL,
  "pageNumber" INTEGER NOT NULL,
  "text"       TEXT    NOT NULL,
  "charCount"  INTEGER NOT NULL DEFAULT 0,
  "source"     TEXT    NOT NULL,
  "confidence" DOUBLE PRECISION,

  CONSTRAINT "BookPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookPage_bookId_pageNumber_key" ON "BookPage"("bookId", "pageNumber");
CREATE INDEX "BookPage_bookId_pageNumber_idx" ON "BookPage"("bookId", "pageNumber");

ALTER TABLE "BookPage"
  ADD CONSTRAINT "BookPage_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
