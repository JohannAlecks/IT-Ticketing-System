-- Additive SLA v1 migration. It deliberately does not backfill tickets: only
-- tickets created after deployment receive a policy snapshot.
CREATE TYPE "PendingReason" AS ENUM ('WAITING_FOR_REQUESTER', 'OTHER');
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SLA_FIRST_RESPONSE_DUE_SOON';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SLA_FIRST_RESPONSE_BREACHED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SLA_RESOLUTION_DUE_SOON';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SLA_RESOLUTION_BREACHED';

CREATE TABLE "sla_policies" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "priority" "TicketPriority" NOT NULL,
  "firstResponseMinutes" INTEGER NOT NULL,
  "resolutionMinutes" INTEGER NOT NULL,
  "dueSoonMinutes" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sla_policies_priority_key" ON "sla_policies"("priority");

ALTER TABLE "notification_preferences" ADD COLUMN "slaDueSoon" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "tickets" ADD COLUMN "slaPolicyId" TEXT;
ALTER TABLE "tickets" ADD COLUMN "slaPolicyName" TEXT;
ALTER TABLE "tickets" ADD COLUMN "slaFirstResponseMinutes" INTEGER;
ALTER TABLE "tickets" ADD COLUMN "slaResolutionMinutes" INTEGER;
ALTER TABLE "tickets" ADD COLUMN "slaDueSoonMinutes" INTEGER;
ALTER TABLE "tickets" ADD COLUMN "firstResponseDueAt" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "firstResponseDueSoonAt" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "firstRespondedAt" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "firstResponseBreachedAt" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "resolutionCycleStartedAt" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "resolutionDueAt" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "resolutionDueSoonAt" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "resolutionCompletedAt" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "resolutionBreachedAt" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "resolutionPausedAt" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "resolutionPausedSeconds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tickets" ADD COLUMN "resolutionPausedMilliseconds" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "tickets" ADD COLUMN "slaVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tickets" ADD COLUMN "pendingReason" "PendingReason";
ALTER TABLE "ticket_history" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "ticket_history" DROP CONSTRAINT "ticket_history_userId_fkey";
ALTER TABLE "ticket_history" ADD CONSTRAINT "ticket_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "tickets_archivedAt_status_firstResponseDueAt_idx" ON "tickets"("archivedAt", "status", "firstResponseDueAt");
CREATE INDEX "tickets_archivedAt_status_resolutionDueAt_idx" ON "tickets"("archivedAt", "status", "resolutionDueAt");
CREATE INDEX "tickets_archivedAt_status_resolutionPausedAt_idx" ON "tickets"("archivedAt", "status", "resolutionPausedAt");

-- Idempotent non-destructive defaults; existing rows, if any, are never changed.
INSERT INTO "sla_policies" ("id", "name", "priority", "firstResponseMinutes", "resolutionMinutes", "dueSoonMinutes", "isActive", "version", "createdAt", "updatedAt") VALUES
  ('160ef8d7-748f-4a52-a318-000000000001', 'Low priority', 'LOW', 480, 4320, 120, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('160ef8d7-748f-4a52-a318-000000000002', 'Medium priority', 'MEDIUM', 240, 2880, 60, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('160ef8d7-748f-4a52-a318-000000000003', 'High priority', 'HIGH', 60, 960, 15, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('160ef8d7-748f-4a52-a318-000000000004', 'Urgent priority', 'URGENT', 15, 240, 3, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("priority") DO NOTHING;
