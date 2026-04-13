ALTER TABLE "Question"
ADD COLUMN "flaggedAt" TIMESTAMP(3),
ADD COLUMN "flaggedByUserId" TEXT,
ADD COLUMN "flaggedReason" TEXT,
ADD COLUMN "flaggedSessionId" TEXT;

ALTER TABLE "UserAnswer"
ADD COLUMN "invalidatedAt" TIMESTAMP(3),
ADD COLUMN "invalidationReason" TEXT;

CREATE INDEX "Question_subItemId_difficulty_flaggedAt_idx"
ON "Question"("subItemId", "difficulty", "flaggedAt");

CREATE INDEX "UserAnswer_subItemId_sessionId_invalidatedAt_idx"
ON "UserAnswer"("subItemId", "sessionId", "invalidatedAt");

CREATE INDEX "UserAnswer_questionId_sessionId_invalidatedAt_idx"
ON "UserAnswer"("questionId", "sessionId", "invalidatedAt");
