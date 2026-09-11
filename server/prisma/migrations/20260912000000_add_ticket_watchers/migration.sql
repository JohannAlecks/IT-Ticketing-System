-- Personal joins only; no tickets/users/notifications are rewritten or backfilled.
ALTER TYPE "NotificationType" ADD VALUE 'TICKET_WATCHED_UPDATE';
ALTER TABLE "notification_preferences" ADD COLUMN "ticketWatchedUpdates" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "ticket_watchers" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_watchers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_watchers_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ticket_watchers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- The leftmost ticketId also serves ticket fan-out lookups; no duplicate index.
CREATE UNIQUE INDEX "ticket_watchers_ticketId_userId_key" ON "ticket_watchers"("ticketId", "userId");
CREATE INDEX "ticket_watchers_userId_createdAt_idx" ON "ticket_watchers"("userId", "createdAt");
