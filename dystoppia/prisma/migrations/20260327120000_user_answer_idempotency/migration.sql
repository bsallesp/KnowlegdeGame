-- AlterTable
ALTER TABLE "UserAnswer" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "UserAnswer_sessionId_idempotencyKey_key" ON "UserAnswer"("sessionId", "idempotencyKey");
