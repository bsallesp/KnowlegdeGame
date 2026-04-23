ALTER TABLE "Topic" ADD COLUMN "userId" TEXT;

CREATE INDEX "Topic_userId_idx" ON "Topic"("userId");

ALTER TABLE "Topic"
  ADD CONSTRAINT "Topic_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
