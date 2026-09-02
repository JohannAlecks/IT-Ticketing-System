-- Additive in-app notification inbox. Resource IDs are intentionally scalar
-- fields so later ticket/article deletion does not erase notification history.
CREATE TYPE "NotificationType" AS ENUM (
  'TICKET_ASSIGNED', 'TICKET_UNASSIGNED', 'TICKET_STATUS_CHANGED',
  'TICKET_PUBLIC_REPLY', 'TICKET_WORK_BLOCKING', 'KNOWLEDGE_SUBMITTED',
  'KNOWLEDGE_PUBLISHED', 'KNOWLEDGE_RETURNED', 'ACCOUNT_REACTIVATED'
);

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "actorId" TEXT,
  "type" "NotificationType" NOT NULL,
  "ticketId" TEXT,
  "articleId" TEXT,
  "title" VARCHAR(160) NOT NULL,
  "message" VARCHAR(300) NOT NULL,
  "dedupeKey" VARCHAR(255),
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");
CREATE INDEX "notifications_recipientId_createdAt_id_idx" ON "notifications"("recipientId", "createdAt" DESC, "id" DESC);
CREATE INDEX "notifications_recipientId_readAt_createdAt_id_idx" ON "notifications"("recipientId", "readAt", "createdAt" DESC, "id" DESC);

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
