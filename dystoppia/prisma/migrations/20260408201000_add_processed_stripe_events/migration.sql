CREATE TABLE "ProcessedStripeEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "userId" TEXT,
  "metadataJson" TEXT,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProcessedStripeEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProcessedStripeEvent_eventId_key" ON "ProcessedStripeEvent"("eventId");
CREATE INDEX "ProcessedStripeEvent_userId_processedAt_idx" ON "ProcessedStripeEvent"("userId", "processedAt");
CREATE INDEX "ProcessedStripeEvent_eventType_processedAt_idx" ON "ProcessedStripeEvent"("eventType", "processedAt");

ALTER TABLE "ProcessedStripeEvent"
ADD CONSTRAINT "ProcessedStripeEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
