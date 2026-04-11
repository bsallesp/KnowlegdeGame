CREATE TABLE "OnboardingConversation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "payloadJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OnboardingConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnboardingConversation_userId_conversationId_key"
  ON "OnboardingConversation"("userId", "conversationId");
CREATE INDEX "OnboardingConversation_userId_updatedAt_idx"
  ON "OnboardingConversation"("userId", "updatedAt");
CREATE INDEX "OnboardingConversation_userId_lastActivityAt_idx"
  ON "OnboardingConversation"("userId", "lastActivityAt");

ALTER TABLE "OnboardingConversation"
  ADD CONSTRAINT "OnboardingConversation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;