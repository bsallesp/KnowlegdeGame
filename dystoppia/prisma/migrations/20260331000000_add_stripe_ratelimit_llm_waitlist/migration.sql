-- Add Stripe and rate-limiting columns to User
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "stripeCustomerId"     TEXT,
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionStatus"   TEXT NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS "hourlyUsage"           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "hourlyWindowStart"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "hourlyCurriculumUsage" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "weeklyUsage"           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "weeklyWindowStart"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "weeklyCurriculumUsage" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "User_stripeCustomerId_key"     ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_stripeSubscriptionId_key" ON "User"("stripeSubscriptionId");

-- CreateTable LLMUsageLog
CREATE TABLE IF NOT EXISTS "LLMUsageLog" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT,
    "model"        TEXT NOT NULL,
    "endpoint"     TEXT NOT NULL,
    "inputTokens"  INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "characters"   INTEGER NOT NULL DEFAULT 0,
    "costUsd"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LLMUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LLMUsageLog_userId_createdAt_idx" ON "LLMUsageLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "LLMUsageLog_createdAt_idx"        ON "LLMUsageLog"("createdAt");

ALTER TABLE "LLMUsageLog"
  ADD CONSTRAINT "LLMUsageLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable WaitlistEntry
CREATE TABLE IF NOT EXISTS "WaitlistEntry" (
    "id"        TEXT NOT NULL,
    "email"     TEXT NOT NULL,
    "source"    TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WaitlistEntry_email_key" ON "WaitlistEntry"("email");
