-- Additive per-user notification settings. Existing users intentionally get
-- no row: application defaults keep every optional notification enabled.
CREATE TABLE "notification_preferences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "ticketAssigned" BOOLEAN NOT NULL DEFAULT true,
  "ticketUnassigned" BOOLEAN NOT NULL DEFAULT true,
  "ticketStatusChanged" BOOLEAN NOT NULL DEFAULT true,
  "ticketPublicReply" BOOLEAN NOT NULL DEFAULT true,
  "ticketWorkBlocking" BOOLEAN NOT NULL DEFAULT true,
  "knowledgeSubmitted" BOOLEAN NOT NULL DEFAULT true,
  "knowledgePublished" BOOLEAN NOT NULL DEFAULT true,
  "knowledgeReturned" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
