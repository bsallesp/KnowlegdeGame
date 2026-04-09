ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "isInternal" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "ExecutionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL DEFAULT 'builder',
    "prompt" TEXT NOT NULL,
    "normalizedIntent" TEXT,
    "requestClass" TEXT NOT NULL DEFAULT 'builder',
    "actionClass" TEXT NOT NULL DEFAULT 'analysis_only',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "viabilityStatus" TEXT,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedCredits" INTEGER NOT NULL DEFAULT 0,
    "finalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalCredits" INTEGER NOT NULL DEFAULT 0,
    "resultJson" TEXT,
    "warningsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ExecutionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExecutionRequest_userId_createdAt_idx" ON "ExecutionRequest"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ExecutionRequest_status_createdAt_idx" ON "ExecutionRequest"("status", "createdAt");

ALTER TABLE "ExecutionRequest"
  ADD CONSTRAINT "ExecutionRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "CreditLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT,
    "eventType" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "metadataJson" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CreditLedger_userId_createdAt_idx" ON "CreditLedger"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "CreditLedger_requestId_idx" ON "CreditLedger"("requestId");

ALTER TABLE "CreditLedger"
  ADD CONSTRAINT "CreditLedger_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CreditLedger"
  ADD CONSTRAINT "CreditLedger_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "ExecutionRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditLedger"
  ADD CONSTRAINT "CreditLedger_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "UsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualCostUsd" DOUBLE PRECISION,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UsageEvent_userId_createdAt_idx" ON "UsageEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "UsageEvent_requestId_createdAt_idx" ON "UsageEvent"("requestId", "createdAt");

ALTER TABLE "UsageEvent"
  ADD CONSTRAINT "UsageEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UsageEvent"
  ADD CONSTRAINT "UsageEvent_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "ExecutionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "eventType" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "requestId" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_requestId_createdAt_idx" ON "AuditLog"("requestId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_eventType_createdAt_idx" ON "AuditLog"("eventType", "createdAt");

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "ExecutionRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ApprovalGate" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "gateType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requiredRole" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalGate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ApprovalGate_requestId_createdAt_idx" ON "ApprovalGate"("requestId", "createdAt");
CREATE INDEX IF NOT EXISTS "ApprovalGate_status_createdAt_idx" ON "ApprovalGate"("status", "createdAt");

ALTER TABLE "ApprovalGate"
  ADD CONSTRAINT "ApprovalGate_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "ExecutionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ApprovalGate"
  ADD CONSTRAINT "ApprovalGate_resolvedByUserId_fkey"
  FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
