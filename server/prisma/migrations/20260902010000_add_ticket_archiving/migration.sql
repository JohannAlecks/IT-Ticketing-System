-- Additive ticket archiving. Existing tickets remain active because both
-- archive columns are nullable. The archivedAt index supports the default
-- active/explicit archived list predicates without changing existing data.
ALTER TYPE "ActivityAction" ADD VALUE 'TICKET_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE 'TICKET_RESTORED';

ALTER TABLE "tickets" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "archivedById" TEXT;

CREATE INDEX "tickets_archivedAt_idx" ON "tickets"("archivedAt");

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_archivedById_fkey"
  FOREIGN KEY ("archivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
